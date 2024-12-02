import { ShoppingCart, UserPlus, LogIn, LogOut } from "lucide-react"
import { NavLink, useNavigate } from "react-router-dom";
import Auth from "../utils/auth";

type NavBarProps = {
  loggedIn: boolean;
  setLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
};

const NavBar: React.FC<NavBarProps> = ({ loggedIn, setLoggedIn }) => {
  const navigate = useNavigate();
  const cart = ["items", "in", "cart"]; //implement cart still

  const logout = () => {
    Auth.logout();
    setLoggedIn(false);
    navigate("/");
  };

  return (
    <header className="fixed top-0 left-0 w-full bg-gray-900 bg-opacity-90 backdrop-blur-md shadow-lg z-40 transition-all duration-300 border-b border-emerald-800">
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-wrap items-center justify-between">
          {/* Brand */}
          <NavLink
            to="/"
            className="text-2xl font-bold text-emerald-400 flex items-center space-x-2 hover:text-emerald-300"
          >
            Store Name
          </NavLink>

          {/* Menu */}
          <nav className="flex items-center gap-4">
            <NavLink
              to="/"
              className="text-gray-300 hover:text-emerald-400 transition duration-300 ease-in-out"
            >
              Home
            </NavLink>

            {/* User Logged In */}
            {loggedIn ? (
              <>
                <NavLink
                  to="/cart"
                  className="relative group text-gray-300 hover:text-emerald-400 transition duration-300 ease-in-out"
                >
                  <ShoppingCart className="mr-1" size={25} />
                  {cart.length > 0 && (
                    <span
                      className='absolute -top-2 -left-2 bg-emerald-500 text-white rounded-full px-2 py-0.5 
									text-xs group-hover:bg-emerald-400 transition duration-300 ease-in-out'
                    >
                      {cart.length}
                    </span>
                  )}
                </NavLink>
                <button
                  onClick={logout}
                  className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-md flex items-center transition duration-300 ease-in-out"
                >
                  <LogOut size={18} />
                  <span className='hidden sm:inline ml-2'>Logout</span>
                </button>
              </>
            ) : (
              <>

                {/* Not Logged In */}
                <NavLink
                  to="/signup"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-4 rounded-md flex items-center transition duration-300 ease-in-out"
                >
                  <UserPlus className="mr-2" size={18} />
                  Sign Up
                </NavLink>
                <NavLink
                  to="/login"
                  className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-md flex items-center transition duration-300 ease-in-out"
                >
                  <LogIn className="mr-2" size={18} />
                  Login
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </div>
    </header >
  );
}

export default NavBar;
