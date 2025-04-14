// src/auth/guards/dynamic-auth.guard.ts
import {
  Injectable,
  ExecutionContext,
  CanActivate,
  Logger,
} from '@nestjs/common';
import { OAuthGuardFactory } from './../strategies/oauth-strategy.factory';
import { Observable } from 'rxjs';

@Injectable()
export class DynamicAuthGuard implements CanActivate {
  private readonly logger = new Logger(DynamicAuthGuard.name);
  constructor(private readonly oAuthGuardFactory: OAuthGuardFactory) {}

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    return { state: request.query.state };
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const provider = request.params.provider;
    const guard = this.oAuthGuardFactory.get(provider);
    guard.getAuthenticateOptions = this.getAuthenticateOptions;

    const state = request.query.state;
    if (state) {
      request.query.state = state;
    }
    return guard.canActivate(context); // 동적으로 AuthGuard를 호출
  }
}
