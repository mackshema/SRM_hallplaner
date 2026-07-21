import jwt from 'jsonwebtoken';

export const requireAuth = (req, res, next) => {
  const header = req.headers['authorization'];
  const token = header && header.startsWith('Bearer ')
    ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: 'No token. Please log in.' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalid or expired.' });
  }
};

export const requireAdmin = (req, res, next) => {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    next();
  });
};

export const requireFaculty = (req, res, next) => {
  requireAuth(req, res, () => {
    if (!['admin','faculty'].includes(req.user?.role)) {
      return res.status(403).json({ message: 'Faculty access required.' });
    }
    next();
  });
};
