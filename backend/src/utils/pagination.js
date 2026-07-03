/**
 * Standard offset-based pagination helper.
 *
 * @param {object} query - The query params (page, limit)
 * @returns {{ skip: number, take: number, page: number, limit: number }}
 */
function parsePagination(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  return { skip, take: limit, page, limit };
}

/**
 * Format paginated response envelope.
 *
 * @param {Array} data - The result set
 * @param {number} total - Total count in DB
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 */
function paginatedResponse(data, total, page, limit) {
  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = { parsePagination, paginatedResponse };
