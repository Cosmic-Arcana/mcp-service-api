import { Module } from '@nestjs/common';
import { AccessTokenVerifier } from './access-token.verifier';
import { AuthorizationServerMetadataService } from './authorization-server-metadata.service';
import { McpBearerAuthMiddleware } from './mcp-bearer-auth.middleware';
import { ProtectedResourceMetadataController } from './protected-resource-metadata.controller';

@Module({
  controllers: [ProtectedResourceMetadataController],
  providers: [
    AuthorizationServerMetadataService,
    AccessTokenVerifier,
    McpBearerAuthMiddleware,
  ],
  exports: [
    AuthorizationServerMetadataService,
    AccessTokenVerifier,
    McpBearerAuthMiddleware,
  ],
})
export class AuthModule {}
