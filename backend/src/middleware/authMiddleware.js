export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ message: "Admin access only" });
  }
  next();
};

export const requireFaculty = (req, res, next) => {
  if (req.user?.role !== "FACULTY") {
    return res.status(403).json({ message: "Faculty access only" });
  }
  next();
};
