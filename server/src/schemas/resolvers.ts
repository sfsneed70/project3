import { GraphQLError } from "graphql";
import { User, Product, Category, CategoryName } from "../models/index.js";
import { signToken } from "../utils/auth.js";
import type IUserContext from "../interfaces/UserContext";
import type IUserDocument from "../interfaces/UserDocument";
import type IProductInput from "../interfaces/ProductInput";
import { stripe } from "../server.js";

const forbiddenException = new GraphQLError(
  "You are not authorized to perform this action.",
  {
    extensions: {
      code: "FORBIDDEN",
    },
  }
);

const resolvers = {
  Query: {
    me: async (_parent: any, _args: any, context: IUserContext) => {
      if (context.user) {
        const user = await User.findById(context.user._id).populate("basket.product");
        return user;
      }
      throw forbiddenException;
    },

    product: async (_parent: any, { productId }: { productId: string }) => {
      return Product.findById(productId).populate("reviews");
    },

    products: async () => {
      return Product.find({}).sort({ name: 1 });
    },

    category: async (_parent: any, { categoryId }: { categoryId: string }) => {
      return Category.findById(categoryId).populate("products");
    },

    categories: async () => {
      return Category.find().sort({ name: 1 });
    },

    categoryByName: async (_parent: any, { categoryName }: { categoryName: string }) => {
      try {
        const category = await CategoryName.findOne({ name: categoryName }).populate("products");
        if (!category) {
          throw new GraphQLError("Category not found.", {
            extensions: {
              code: "NOT_FOUND",
            },
          });
        }
        return category;
      } catch (error) {
        console.error("Error fetching category by name:", error);
        throw new GraphQLError("Error fetching category by name.");
      }
    },

    categoryNames: async () => {
      try {
        return await CategoryName.find().sort({ name: 1 });
      } catch (error) {
        console.error("Error fetching category names:", error);
        throw new GraphQLError("Error fetching category names.");
      }
    },

    checkout: async (_parent: any, args: any, context: IUserContext) => {
      let url;
      if (context.headers) {
        url = new URL(context.headers.referer || "").origin;
      }

      if (!context.user) {
        throw new Error("User not authenticated");
      }

      const order = {
        products: args.products,
        purchaseDate: new Date(),
      };

      // Push the order to the current user's `orders` field
      const user = await User.findById(context.user._id);
      if (user) {
        user.orders.push(order as any);
        await user.save();
      }

      // Group products by their ID and count the quantity
      const productQuantities: Record<string, number> = {};
      order.products.forEach((productId: string) => {
        productQuantities[productId] = (productQuantities[productId] || 0) + 1;
      });

      const line_items = [];
      const productIds = Object.keys(productQuantities); // The list of product IDs
      const products: any = await Product.find({ _id: { $in: productIds } });  // Fetch the products by their IDs
    

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const quantity = productQuantities[product._id.toString()]; // Get the quantity for the product

        const finalPrice = product.onSale && product.salePrice ? product.salePrice : product.price;

        // Create the product in Stripe (or find it if already created)
        const stripeProduct = await stripe.products.create({
          name: product.name,
          description: product.description,
          images: [product.imageUrl]
        });

        const price = await stripe.prices.create({
          product: stripeProduct.id,
          unit_amount: Math.round(finalPrice * 100),
          currency: 'usd',
        });
        line_items.push({
          price: price.id,
          quantity
        });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items,
        mode: 'payment',
        success_url: `${url}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${url}/cart`
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    }
  },

  Mutation: {
    addUser: async (
      _parent: any,
      args: any
    ): Promise<{ token: string; user: IUserDocument }> => {
      const user = await User.create(args);
      const token = signToken(user.username, user.email, user._id);

      return { token, user: user as IUserDocument };
    },

    login: async (
      _parent: any,
      { email, password }: { email: string; password: string }
    ): Promise<{ token: string; user: IUserDocument }> => {
      const user = await User.findOne({ email });

      if (!user || !(await user.isCorrectPassword(password))) {
        throw new GraphQLError("Incorrect credentials. Please try again.", {
          extensions: {
            code: "FORBIDDEN",
          },
        });
      }

      const token = signToken(user.username, user.email, user._id);
      return { token, user: user as IUserDocument };
    },

    addProduct: async (
      _parent: any,
      { productData }: { productData: IProductInput },
      context: IUserContext
    ) => {
      if (context.user) {
        const product = await Product.create({
          ...productData,
        });

        return product;
      }
      throw forbiddenException;
    },

    removeProduct: async (
      _parent: any,
      { productId }: { productId: string },
      context: IUserContext
    ) => {
      if (context.user) {
        const product = await Product.findByIdAndDelete(productId);
        return product;
      }
      throw forbiddenException;
    },

    addStock: async (
      _parent: any,
      { productId, quantity }: { productId: string; quantity: number },
      context: IUserContext
    ) => {
      if (context.user) {
        const product = await Product.findById(productId);
        if (!product) {
          throw new GraphQLError("Product not found.", {
            extensions: {
              code: "NOT_FOUND",
            },
          });
        }
        product.stock += quantity;
        await product.save();
        return product;
      }
      throw forbiddenException;
    },

    removeStock: async (
      _parent: any,
      { productId, quantity }: { productId: string; quantity: number },
      context: IUserContext
    ) => {
      if (context.user) {
        const product = await Product.findById(productId);
        if (!product) {
          throw new GraphQLError("Product not found.", {
            extensions: {
              code: "NOT_FOUND",
            },
          });
        }
        if (product.stock >= quantity) {
          product.stock -= quantity;
          await product.save();
        } else {
          throw new GraphQLError("Insufficient stock.", {
            extensions: {
              code: "BAD_REQUEST",
            },
          });
        }
        return product;
      }
      throw forbiddenException;
    },

    addCategory: async (
      _parent: any,
      { categoryData }: { categoryData: { name: string; imageUrl: string } },
      context: IUserContext
    ) => {
      if (context.user) {
        const category = await Category.create(categoryData);
        return category;
      }
      throw forbiddenException;
    },

    removeCategory: async (
      _parent: any,
      { categoryId }: { categoryId: string },
      context: IUserContext
    ) => {
      if (context.user) {
        const category = await Category.findByIdAndDelete(categoryId);
        return category;
      }
      throw forbiddenException;
    },

    addProductToCategory: async (
      _parent: any,
      { productId, categoryId }: { productId: string; categoryId: string },
      context: IUserContext
    ) => {
      if (context.user) {
        const category = await Category.findById(categoryId);
        if (!category) {
          throw new GraphQLError("Category not found.", {
            extensions: {
              code: "NOT_FOUND",
            },
          });
        }

        const product = await Product.findById(productId);
        if (!product) {
          throw new GraphQLError("Product not found.", {
            extensions: {
              code: "NOT_FOUND",
            },
          });
        }

        await Category.findByIdAndUpdate(
          categoryId,
          { $push: { products: productId } },
          { new: true }
        );
        return category;
      }
      throw forbiddenException;
    },

    addReview: async (
      _parent: any,
      {
        productId,
        review,
        rating,
      }: { productId: string; review: string; rating: number },
      context: IUserContext
    ) => {
      if (context.user) {
        const product = await Product.findById(productId);
        if (!product) {
          throw new GraphQLError("Product not found.", {
            extensions: {
              code: "NOT_FOUND",
            },
          });
        }

        for (const item of product.reviews) {
          // Check if the user has already reviewed the product
          if (item.username === context.user.username) {
            throw new GraphQLError("You have already reviewed this product.", {
              extensions: {
                code: "FORBIDDEN",
              },
            });
          }
        }

        // Otherwise, add the review
        await Product.findByIdAndUpdate(
          productId,
          {
            $push: {
              reviews: {
                review,
                rating,
                username: context.user.username,
              },
            },
          },
          { new: true }
        );
        return product;
      }
      throw forbiddenException;
    },

    editReview: async (
      _parent: any,
      {
        productId,
        review,
        rating,
      }: {
        productId: string;
        review: string;
        rating: number;
      },
      context: IUserContext
    ) => {
      if (context.user) {
        const product = await Product.findById(productId);
        if (!product) {
          throw new GraphQLError("Product not found.", {
            extensions: {
              code: "NOT_FOUND",
            },
          });
        }

        for (const item of product.reviews) {
          // Find the review by the user and update it
          if (item.username === context.user.username) {
            item.review = review;
            item.rating = rating;
            await product.save();
            return product;
          }
        }
      }
      throw forbiddenException;
    },

    addBasketItem: async (
      _parent: any,
      { productId, quantity }: { productId: string; quantity: number },
      context: IUserContext
    ) => {
      if (context.user) {
        const product = await Product.findById(productId);
        if (!product) {
          throw new GraphQLError("Product not found.", {
            extensions: {
              code: "NOT_FOUND",
            },
          });
        }

        const user = await User.findById(context.user._id);
        if (user) {
          // If the user already has the product in their basket, update the quantity
          for (const item of user.basket) {
            if (item.product.toString() === productId) {
              item.quantity += quantity;
              await user.save();
              return user;
            }
          }

          // Otherwise, add the product to the basket
          const basketItem = {
            product: productId,
            quantity,
          };
          return await User.findByIdAndUpdate(
            context.user._id,
            { $push: { basket: basketItem } },
            { new: true }
          );
        }
      }
      throw forbiddenException;
    },

    removeBasketItem: async (
      _parent: any,
      { productId }: { productId: string },
      context: IUserContext
    ) => {
      if (context.user) {
        const product = await Product.findById(productId);
        if (!product) {
          throw new GraphQLError("Product not found.", {
            extensions: {
              code: "NOT_FOUND",
            },
          });
        }

        const user = await User.findById(context.user._id);
        if (user) {
          // If the user already has the product in their basket, remove it
          for (const item of user.basket) {
            if (item.product.toString() === productId) {
              return await User.findByIdAndUpdate(context.user._id, {
                $pull: { basket: { product: productId } },
              }, { new: true });
            }
          }
        }
        // return user;
      }
      throw forbiddenException;
    },

    decrementBasketItem: async (
      _parent: any,
      { productId }: { productId: string },
      context: IUserContext
    ) => {
      if (context.user) {
        const product = await Product.findById(productId);
        if (!product) {
          throw new GraphQLError("Product not found.", {
            extensions: {
              code: "NOT_FOUND",
            },
          });
        }
        const user = await User.findById(context.user._id);
        if (user) {
          for (const item of user.basket) {
            if (item.product.toString() === productId) {
              if (item.quantity > 1) {
                item.quantity -= 1;
                await user.save();
                return user;
              }
              return await User.findByIdAndUpdate(context.user._id, {
                $pull: { basket: { product: productId } },
              }, { new: true });
            }
          }
        }
      }
      throw forbiddenException;
    },

    clearBasket: async (_parent: any, _args: any, context: IUserContext) => {
      if (context.user) {
        return await User.findByIdAndUpdate(context.user._id, { basket: [] }, { new: true });
      }
      throw forbiddenException;
    },
  },
};

export default resolvers;
