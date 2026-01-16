
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { isAdmin, isFaculty } from "@/lib/auth";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  // Determine where to redirect the user based on their role
  const getHomeLink = () => {
    if (isAdmin()) return "/admin";
    if (isFaculty()) return "/faculty";
    return "/login";
  };

  const homeLink = getHomeLink();
  const homeLinkText = homeLink === "/login" ? "Login Page" : 
                      homeLink === "/admin" ? "Admin Dashboard" : "Faculty Dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-6xl font-bold text-red-500 mb-4">404</h1>
        <p className="text-xl text-gray-700 mb-6">Oops! Page not found</p>
        <p className="text-gray-600 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="space-y-4">
          <Button asChild className="w-full">
            <Link to={homeLink}>
              Return to {homeLinkText}
            </Link>
          </Button>
          {location.pathname.startsWith("/admin") && (
            <div className="text-sm text-gray-500">
              Looking for an admin page? Check the sidebar for available options.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotFound;
