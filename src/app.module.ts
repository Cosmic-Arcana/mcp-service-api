import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { McpBearerAuthMiddleware } from './auth/mcp-bearer-auth.middleware';
import { configuration } from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { McpController } from './mcp/mcp.controller';
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
    AuthModule,
    McpModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every MCP method (POST, GET, DELETE) needs a token for this resource: no account, no MCP.
    consumer.apply(McpBearerAuthMiddleware).forRoutes(McpController);
  }
}
