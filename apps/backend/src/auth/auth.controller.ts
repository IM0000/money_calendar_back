// /auth/auth.controller.ts
import {
  Controller,
  Get,
  Query,
  Res,
  Param,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Logger,
  Inject,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/users.dto';
import { OAuthConnectionDto, StatePayload, VerifyDto } from './dto/auth.dto';
import { LoginDto } from './dto/auth.dto';
import { DynamicAuthGuard } from './guard/dynamic-auth.guard';
import { UserDto } from './dto/users.dto';
import { ErrorCodes } from '../common/enums/error-codes.enum';
import { ConfigType } from '@nestjs/config';
import { frontendConfig } from '../config/frontend.config';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { RequestWithUser } from '../common/types/request-with-user';

@Controller('api/v1/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(
    @Inject(frontendConfig.KEY)
    private frontendConfiguration: ConfigType<typeof frontendConfig>,
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * OAuth 로그인 요청 처리 (공통 엔드포인트)
   * @param provider OAuth 제공자 이름
   * @param req 응답 객체
   */
  @Get('oauth/:provider')
  @UseGuards(DynamicAuthGuard)
  async oauthLogin(@Param('provider') provider: string) {
    this.logger.log('oauthLogin : ' + provider);
  }

  /**
   * OAuth 콜백 처리 (공통 엔드포인트)
   * @param provider OAuth 제공자 이름
   * @param query OAuth 제공자로부터 받은 쿼리 파라미터
   * @param res 응답 객체
   */
  @Get('oauth/:provider/callback')
  @UseGuards(DynamicAuthGuard)
  async oauthCallback(
    @Param('provider') provider: string,
    @Query() query: any,
    @Req() req: any,
    @Res() res: any,
  ) {
    const frontendURL = this.frontendConfiguration.baseUrl;
    // Passport를 통해 검증된 사용자 정보
    const oauthUser = req.user;

    if (!oauthUser) {
      return res.redirect(
        `${frontendURL}/auth/error?errorCode=${ErrorCodes.AUTH_002}&message=OAuth 인증에 실패했습니다.`,
      );
    }

    // 연결 요청인지 확인 (마이페이지에서 연결 요청 시)
    const state = req.query.state;
    if (state && typeof state === 'string') {
      // 이미 로그인된 사용자가 계정 연결을 요청한 경우
      const stateToken = state;
      // state token 검증
      const statePayload: StatePayload =
        this.authService.verifyJwtToken(stateToken);

      await this.usersService.linkOAuthAccount(statePayload.userId, oauthUser);

      return res.redirect(
        `${frontendURL}/mypage?message=계정이 성공적으로 연결되었습니다.`,
      );
    }

    // 일반 로그인 처리
    // oauth 인증 정보로 회원검색
    const userByOAuthId = await this.usersService.findUserByOAuthId(
      oauthUser.provider,
      oauthUser.providerId,
    );

    // 연동된 회원정보는 없는데,
    if (userByOAuthId === null) {
      this.logger.log('연동된 회원정보가 없어영', oauthUser.email);
      //oauth 이메일로 메일인증된 회원정보가 있으면 그 계정에 연동시킴
      const userByOauthEmail = await this.usersService.findUserByEmail(
        oauthUser.email,
      );

      this.logger.log('userByOauthEmail', userByOauthEmail);

      if (
        userByOauthEmail &&
        userByOauthEmail.email &&
        userByOauthEmail.verified
      ) {
        // 연동
        await this.usersService.linkOAuthAccount(
          userByOauthEmail.id,
          oauthUser,
        );
        // 로그인 처리
        const loginResult = await this.authService.loginWithOAuth(
          userByOauthEmail,
        );
        return res.redirect(
          `${frontendURL}/auth/success?token=${loginResult.accessToken}`,
        );
      }

      // oauth 메일로 이메일 인증된 계정이 없는 경우 회원가입 처리
      const createdUser = await this.usersService.createUserFromOAuth(
        oauthUser,
      );

      const loginResult = await this.authService.loginWithOAuth(createdUser);

      return res.redirect(
        `${frontendURL}/auth/success?token=${loginResult.accessToken}`,
      );
    }

    // oauth 이메일로 (메일인증 & 연동)된 회원정보가 있으면 로그인 처리
    if (userByOAuthId.email && userByOAuthId.verified) {
      const loginResult = await this.authService.loginWithOAuth(userByOAuthId);
      return res.redirect(
        `${frontendURL}/auth/success?token=${loginResult.accessToken}`,
      );
    }

    return res.redirect(
      `${frontendURL}/auth/error?errorCode=${ErrorCodes.AUTH_002}&message=OAuth 인증에 실패했습니다.`,
    );
  }

  /**
   * 이메일로 인증 코드 요청
   * @param registerDto 이메일 주소
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(
    @Body() registerDto: RegisterDto,
  ): Promise<{ token: string; message: string }> {
    this.logger.log('registerDto', registerDto);
    const { email } = registerDto;
    await this.usersService.sendVerificationCode(email);
    const emailVerificationToken =
      await this.authService.generateVerificationToken(email);
    this.logger.log('register end', emailVerificationToken);
    return {
      token: emailVerificationToken,
      message: '인증 코드가 이메일로 전송되었습니다.',
    };
  }

  /**
   * 인증 코드 검증
   * @param verifyDto 이메일, 인증 코드
   * @returns 상태 업데이트 된 유저 객체
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmailCode(@Body() verifyDto: VerifyDto): Promise<UserDto> {
    const { email, code } = verifyDto;
    this.logger.log('/auth/verify', verifyDto);
    const user = await this.usersService.verifyEmailCode(email, code);
    this.logger.log('verify end', user);
    return user;
  }

  /**
   * 이메일 인증 token을 받고 토큰 확인 후 email을 반환
   * @param token 이메일토큰
   * @returns email
   */
  @Get('email-verification')
  async getVerifyEmail(
    @Query('token') token: string,
  ): Promise<{ email: string }> {
    this.logger.log('email-verification', token);
    const email = await this.usersService.findEmailFromVerificationToken(token);
    return { email };
  }

  /**
   * 이메일과 비밀번호로 로그인
   * @param loginDto 이메일, 비밀번호
   */
  @Post('login')
  async login(@Body() loginDto: LoginDto): Promise<any> {
    return await this.authService.loginWithEmail(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  getStatus(@Req() req): any {
    return { isAuthenticated: true, user: req.user };
  }

  /**
   * OAuth 계정 연결
   */
  @Post('/oauth/connect')
  @UseGuards(JwtAuthGuard)
  connectOAuthAccount(
    @Req() req: RequestWithUser,
    @Body() oauthConnectionDto: OAuthConnectionDto,
  ) {
    const { provider } = oauthConnectionDto;
    const stateToken = this.authService.generateOAuthStateToken(
      req.user.id,
      provider,
    );

    // OAuth 인증 요청 URL을 반환
    return {
      message: '계정 연결을 위해 OAuth 인증 페이지로 이동하세요.',
      redirectUrl: `/api/v1/auth/oauth/${provider}?state=${encodeURIComponent(
        stateToken,
      )}`,
    };
  }
}
