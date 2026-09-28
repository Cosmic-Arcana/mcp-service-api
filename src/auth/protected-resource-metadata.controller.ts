import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OAuthProtectedResourceMetadata } from '@modelcontextprotocol/server';
import type { AuthConfig } from '../config/configuration';

/**
 * RFC 9728 Protected Resource Metadata. MCP clients find it via the `resource_metadata`
 * parameter of our 401 challenge, and learn from it which Authorization Server to use.
 * Served both at the path-inserted URL (`/.well-known/oauth-protected-resource/mcp`) and
 * at the root, since clients probe either.
 */
@Controller('.well-known')
export class ProtectedResourceMetadataController {
  private readonly metadata: OAuthProtectedResourceMetadata;
  private readonly resourcePath: string;

  constructor(configService: ConfigService) {
    const auth = configService.getOrThrow<AuthConfig>('auth');
    const resource = configService.getOrThrow<string>('mcpResourceUrl');
    this.resourcePath = new URL(resource).pathname.replace(/^\/|\/$/g, '');
    this.metadata = {
      resource,
      authorization_servers: [auth.issuer],
      scopes_supported: auth.scopesSupported,
      bearer_methods_supported: ['header'],
      resource_name: 'Cosmic Arcana MCP',
    };
  }

  @Get('oauth-protected-resource')
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Cache-Control', 'public, max-age=3600')
  root(): OAuthProtectedResourceMetadata {
    return this.metadata;
  }

  @Get('oauth-protected-resource/*path')
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Cache-Control', 'public, max-age=3600')
  forPath(
    @Param('path') path: string | string[],
  ): OAuthProtectedResourceMetadata {
    const requested = (Array.isArray(path) ? path.join('/') : path).replace(
      /^\/|\/$/g,
      '',
    );
    if (requested !== this.resourcePath) {
      throw new NotFoundException();
    }
    return this.metadata;
  }
}
