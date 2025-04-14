// common/filters/all-exceptions.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes } from '../enums/error-codes.enum';
import { frontendConfig } from '../../config/frontend.config';
import { ConfigType } from '@nestjs/config';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    @Inject(frontendConfig.KEY)
    private frontendConfiguration: ConfigType<typeof frontendConfig>,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { method, url, body, params, query } = request;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode: string = ErrorCodes.SERVER_001;
    let errorMessage = '내부 서버 오류가 발생했습니다.';
    let data = null;
    let stack = null;

    // 개발 환경에서만 스택 트레이스 포함
    if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      stack = exception.stack;
    }

    // 에러 정보 로깅
    const errorContext = {
      timestamp: new Date().toISOString(),
      path: url,
      method,
      requestBody: this.sanitizeData(body),
      requestParams: params,
      requestQuery: query,
      errorStack: stack,
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        errorMessage = exceptionResponse;
      } else if (
        exceptionResponse !== null &&
        typeof exceptionResponse === 'object'
      ) {
        errorCode = (exceptionResponse as any).errorCode || errorCode;
        errorMessage = (exceptionResponse as any).errorMessage || errorMessage;
        data = (exceptionResponse as any).data || null;
      }
    } else {
      // 에러 메시지가 Error 객체에서 온 경우 설정
      if (exception instanceof Error) {
        errorMessage = exception.message;
      }
    }

    this.logger.error(
      `[${errorCode}] ${errorMessage} (${status})`,
      errorContext,
    );

    // 프론트엔드 URL 설정
    const frontendURL = this.frontendConfiguration.baseUrl;

    if (url.includes('/auth/oauth/') && query.state) {
      const redirectUrl = `${frontendURL}/mypage?errorCode=${errorCode}&errorMessage=${encodeURIComponent(
        errorMessage,
      )}`;
      return response.redirect(redirectUrl);
    }

    // // 일반적인 브라우저 요청인 경우 (HTML 응답을 원하는 경우)
    // if (request.accepts('html')) {
    //   // 에러 코드를 쿼리스트링에 담아 에러 페이지로 리다이렉트
    //   const redirectUrl = `${frontendURL}/error?errorCode=${errorCode}&message=${encodeURIComponent(
    //     errorMessage,
    //   )}`;
    //   return response.redirect(redirectUrl);
    // }

    // API 요청 등의 경우 JSON 응답
    const responseBody = {
      statusCode: status,
      errorCode,
      errorMessage,
      data,
      timestamp: new Date().toISOString(),
      path: url,
    };

    // 개발 환경에서만 스택 트레이스 포함
    if (process.env.NODE_ENV !== 'production' && stack) {
      responseBody['stack'] = stack;
    }

    response.status(status).json(responseBody);
  }

  // 민감한 정보 제거
  private sanitizeData(data: any): any {
    if (!data) return data;

    const sanitized = { ...data };

    // 비밀번호 필드 마스킹
    if (sanitized.password) sanitized.password = '******';
    if (sanitized.currentPassword) sanitized.currentPassword = '******';
    if (sanitized.newPassword) sanitized.newPassword = '******';

    // 토큰 필드 마스킹
    if (sanitized.accessToken) sanitized.accessToken = '******';
    if (sanitized.refreshToken) sanitized.refreshToken = '******';

    return sanitized;
  }
}
