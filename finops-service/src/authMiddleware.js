const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const { Pool } = require('pg');

const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID;
const awsRegion = process.env.AWS_REGION || 'us-east-1';
const jwksUri = `https://cognito-idp.${awsRegion}.amazonaws.com/${cognitoUserPoolId}/.well-known/jwks.json`;

const client = cognitoUserPoolId ? jwksRsa({
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
  jwksUri: jwksUri
}) : null;

function getKey(header, callback){
  client.getSigningKey(header.kid, function(err, key) {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

// Global Auth Pool for internal DB checks (if local check needed)
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Validate JWT (Support Cognito JWKS or Local secret fallback)
const validateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  const token = authHeader.split(' ')[1];

  if (cognitoUserPoolId) {
    jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
      if (err) return res.status(401).json({ error: 'Invalid or expired Cognito token' });
      req.user = {
        userId: decoded.sub,
        username: decoded['cognito:username'] || decoded.username,
        role: decoded['custom:role'] || decoded.role || 'ELDER',
        email: decoded.email
      };
      next();
    });
  } else {
    // Fallback to local JWT verification
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        role: (decoded.role || 'ELDER').toUpperCase(), // normalize roles
        email: decoded.email
      };
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid or expired local token' });
    }
  }
};

// Require strict roles (RBAC)
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    const userRole = req.user.role;
    if (allowedRoles.includes(userRole)) {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
  };
};

// Relationship-based authorization check (ABAC)
// Verifies if FAMILY member is linked to the ELDER
const checkRelationship = (elderIdParam = 'userId') => {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });

    const { userId, role } = req.user;
    const elderId = req.params[elderIdParam] || req.body[elderIdParam] || req.query[elderIdParam];

    if (!elderId) {
      return res.status(400).json({ error: 'Elder ID is required for verification' });
    }

    // Admins and Super Admins bypass checks
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      return next();
    }

    // Elder can only access their own data
    if (role === 'ELDER') {
      if (String(userId) === String(elderId)) {
        return next();
      } else {
        return res.status(403).json({ error: 'Forbidden: Elders cannot access other users records' });
      }
    }

    // Family role must verify link in DB
    if (role === 'FAMILY') {
      try {
        const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
        
        let linked = false;
        if (process.env.DB_NAME === 'users_db') {
          const result = await pool.query(
            'SELECT 1 FROM family_links WHERE family_id = $1 AND elder_id = $2',
            [userId, elderId]
          );
          linked = result.rows.length > 0;
        } else {
          // Check link via HTTP call to auth-service
          const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
          const response = await fetch(`${authServiceUrl}/links/verify/${userId}/${elderId}`);
          if (response.ok) {
            const data = await response.json();
            linked = data.linked;
          }
        }

        if (linked) {
          next();
        } else {
          res.status(403).json({ error: 'Forbidden: You are not linked to this elder' });
        }
      } catch (err) {
        console.error('Relationship verification failed:', err);
        res.status(500).json({ error: 'Failed to verify user relationship' });
      }
    } else {
      res.status(403).json({ error: 'Forbidden: Invalid role' });
    }
  };
};

module.exports = {
  validateToken,
  requireRole,
  checkRelationship
};
