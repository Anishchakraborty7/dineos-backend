/**
 * Standardized API response helpers.
 * All responses follow a consistent structure for predictable frontend consumption.
 */

/**
 * 200/201 success response
 */
const success = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

/**
 * Error response
 */
const error = (res, message = 'An error occurred', statusCode = 500, details = null) => {
  return res.status(statusCode).json({
    success: false,
    error: message,
    ...(details && { details }),
    timestamp: new Date().toISOString()
  });
};

/**
 * Paginated list response
 */
const paginated = (res, data, total, page, limit) => {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      total: parseInt(total),
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    },
    timestamp: new Date().toISOString()
  });
};

module.exports = { success, error, paginated };
