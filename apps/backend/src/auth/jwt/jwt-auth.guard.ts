import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const request = super.getRequest(context);
    const tokenFromQuery = request.query?.token;
    if (tokenFromQuery) {
      request.headers.authorization = `Bearer ${tokenFromQuery}`;
    }
    return request;
  }
}
