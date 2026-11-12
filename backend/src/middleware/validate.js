'use strict';

/**
 * Zod request validation. Usage:
 *   validate({ body: schema, query: schema, params: schema })
 * Parsed (coerced/trimmed) values replace the originals; ZodErrors are
 * converted to 400 VALIDATION_ERROR by the error handler.
 */
module.exports = function validate(schemas) {
  return function validator(req, res, next) {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.validatedQuery = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      next();
    } catch (err) {
      next(err);
    }
  };
};

