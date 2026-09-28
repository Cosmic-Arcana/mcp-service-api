import * as Joi from 'joi';

const httpsUnlessInsecure = (field: string) =>
  Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .when('AUTH_ALLOW_INSECURE_ISSUER', {
      is: true,
      otherwise: Joi.string()
        .uri({ scheme: ['https'] })
        .messages({
          'string.uriCustomScheme': `${field} must use https (AUTH_ALLOW_INSECURE_ISSUER is for local development only)`,
        }),
    });

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3003),

  MCP_RESOURCE_URL: httpsUnlessInsecure('MCP_RESOURCE_URL'),

  AUTH_ALLOW_INSECURE_ISSUER: Joi.boolean()
    .default(false)
    .when('NODE_ENV', { is: 'production', then: Joi.valid(false) }),
  AUTH_ISSUER: httpsUnlessInsecure('AUTH_ISSUER'),
  AUTH_JWKS_URI: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .allow(''),
  // Asymmetric algorithms only: a shared-secret HS* key would let any holder mint tokens.
  AUTH_ALLOWED_ALGORITHMS: Joi.string()
    .pattern(
      /^((RS|PS|ES)(256|384|512)|EdDSA)([\s,]+((RS|PS|ES)(256|384|512)|EdDSA))*$/,
    )
    .default('RS256,ES256'),
  AUTH_CLOCK_TOLERANCE_SEC: Joi.number().integer().min(0).max(300).default(30),
  AUTH_REQUIRE_AT_JWT_TYP: Joi.boolean().default(false),
  AUTH_SCOPES_SUPPORTED: Joi.string().default(
    'cosmic:read spreads:read spreads:write',
  ),

  TOKEN_EXCHANGE_CLIENT_ID: Joi.string().min(1).required(),
  TOKEN_EXCHANGE_AUTH_METHOD: Joi.string()
    .valid('client_secret_basic', 'private_key_jwt')
    .default('private_key_jwt')
    .when('NODE_ENV', { is: 'production', then: Joi.valid('private_key_jwt') }),
  TOKEN_EXCHANGE_CLIENT_SECRET: Joi.string().when(
    'TOKEN_EXCHANGE_AUTH_METHOD',
    {
      is: 'client_secret_basic',
      then: Joi.string().min(16).required(),
      otherwise: Joi.optional().allow(''),
    },
  ),
  TOKEN_EXCHANGE_PRIVATE_KEY: Joi.string().when('TOKEN_EXCHANGE_AUTH_METHOD', {
    is: 'private_key_jwt',
    then: Joi.string()
      .pattern(/BEGIN PRIVATE KEY/)
      .required(),
    otherwise: Joi.optional().allow(''),
  }),
  TOKEN_EXCHANGE_PRIVATE_KEY_ALG: Joi.string()
    .valid('RS256', 'PS256', 'ES256', 'EdDSA')
    .default('ES256'),
  TOKEN_EXCHANGE_PRIVATE_KEY_ID: Joi.string().optional().allow(''),
  TOKEN_EXCHANGE_TIMEOUT_MS: Joi.number().integer().min(100).default(5_000),
  TOKEN_EXCHANGE_EXPIRY_SKEW_SEC: Joi.number().integer().min(0).default(30),
  TOKEN_EXCHANGE_MAX_CACHE_ENTRIES: Joi.number()
    .integer()
    .min(1)
    .default(10_000),

  NASA_SERVICE_HOST: Joi.string().hostname().default('127.0.0.1'),
  NASA_SERVICE_PORT: Joi.number().port().default(4002),
  NASA_SERVICE_TIMEOUT_MS: Joi.number().integer().min(100).default(10_000),
  NASA_SERVICE_RESOURCE: Joi.string()
    .uri()
    .default('urn:cosmic-arcana:nasa-service'),
  NASA_SERVICE_SCOPES: Joi.string().default('cosmic:read'),
});
