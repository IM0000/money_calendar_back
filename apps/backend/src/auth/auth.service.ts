import { EmailService } from './../email/email.service';
import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/auth.dto';
import { User } from '@prisma/client';
import { ConfigType } from '@nestjs/config';
import { jwtConfig } from '../config/jwt.config';
import { v4 as uuidv4 } from 'uuid';
import { ErrorCodes } from '../common/enums/error-codes.enum';
import * as bcrypt from 'bcryptjs';
import { OAuthProviderEnum } from './enum/oauth-provider.enum';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    @Inject('JWT') private readonly jwt: JwtService,
    @Inject('PASSWORD_RESET_JWT') private readonly passwordResetJwt: JwtService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * 이메일과 비밀번호 검증
   * @param email 사용자 이메일
   * @param password 입력된 비밀번호
   * @returns 검증 결과 (true: 성공, false: 실패)
   */
  async validateUser(email: string, password: string): Promise<boolean> {
    const user = await this.usersService.findUserByEmail(email);

    // 사용자가 없거나 비밀번호가 설정되지 않은 경우
    if (!user || !user.password) {
      return false;
    }

    // 비밀번호 비교
    const isPasswordValid = await bcrypt.compare(password, user.password);
    return isPasswordValid;
  }

  /**
   * 이메일과 비밀번호로 로그인 처리
   * @param loginDto 로그인 정보
   * @returns JWT 토큰과 사용자 정보
   */
  async loginWithEmail(loginDto: LoginDto): Promise<any> {
    const user = await this.usersService.findUserByEmail(loginDto.email);

    if (!user) {
      throw new ForbiddenException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '존재하지 않는 이메일입니다.',
      });
    }

    if (!user.password) {
      // 비밀번호 설정이 안된 경우
      throw new ForbiddenException({
        errorCode: ErrorCodes.ACCOUNT_001,
        errorMessage: '비밀번호 설정이 필요합니다.',
        data: user,
      });
    }

    const isLogin = await this.validateUser(loginDto.email, loginDto.password);

    if (!isLogin) {
      throw new UnauthorizedException({
        errorCode: ErrorCodes.AUTH_002,
        errorMessage: '잘못된 이메일 또는 비밀번호입니다.',
      });
    }
    const token = this.generateJwtAccessToken(user);

    const { password, ...userWithoutPassword } = user;

    return { accessToken: token, user: userWithoutPassword };
  }

  /**
   * OAuth 제공자를 통해 로그인 처리
   * @param oauthUser OAuth 사용자 정보
   * @returns JWT 토큰과 사용자 정보
   */
  async loginWithOAuth(user: User): Promise<any> {
    // JWT 토큰 생성
    const token = this.generateJwtAccessToken(user);

    const { password, ...userWithoutPassword } = user;

    return { accessToken: token, user: userWithoutPassword };
  }

  /**
   * JWT 토큰 생성
   * @param user 사용자 정보
   * @returns JWT 토큰
   */
  private generateJwtAccessToken(user: User): string {
    const payload = {
      type: 'access',
      sub: user.id, // 토큰의 subject (주체)로 사용자 ID 설정
      email: user.email,
      nickname: user.nickname,
    };

    const secret = this.jwtConfiguration.secret;
    const expiresIn = this.jwtConfiguration.expiration;

    return this.jwt.sign(payload, { secret, expiresIn });
  }

  /**
   * 이메일 인증 토큰 생성 및 저장
   * @param email 사용자 이메일
   * @returns opaque 토큰
   */
  async generateVerificationToken(email: string): Promise<string> {
    const token = uuidv4(); // 고유한 토큰 생성

    // 토큰을 데이터베이스에 저장
    await this.usersService.storeVerificationToken(token, email);
    return token;
  }

  /**
   * oauth 연동 state 토큰 생성
   * @param email 사용자 이메일
   * @returns oauth 연동 state 토큰
   */
  generateOAuthStateToken(userId: number, provider: string): string {
    // 유효한 OAuth 제공자인지 확인
    const validProviders = [
      OAuthProviderEnum.Google.toString(),
      OAuthProviderEnum.Apple.toString(),
      OAuthProviderEnum.Discord.toString(),
      OAuthProviderEnum.Kakao.toString(),
    ];

    if (!validProviders.includes(provider)) {
      throw new BadRequestException({
        errorCode: ErrorCodes.OAUTH_001,
        errorMessage: `지원하지 않는 OAuth 제공자입니다: ${provider}`,
      });
    }

    const statePayload = {
      type: 'access',
      oauthMethod: 'connect',
      userId,
      provider,
    };

    const secret = this.jwtConfiguration.secret;

    const stateToken = this.jwt.sign(statePayload, {
      secret,
      expiresIn: '5m',
    });

    return stateToken;
  }

  verifyJwtToken(token: string): any {
    try {
      const secret = this.jwtConfiguration.secret;
      return this.jwt.verify(token, { secret });
    } catch (error) {
      throw new UnauthorizedException({
        errorCode: ErrorCodes.AUTH_001,
        errorMessage: '유효하지 않거나 만료된 토큰입니다.',
      });
    }
  }

  /**
   * 비밀번호 재설정 토큰 생성
   * @param email 사용자 이메일
   * @returns JWT 토큰
   */
  generatePasswordResetToken(email: string): string {
    const payload = {
      type: 'passwordReset',
      email,
    };
    const secret = this.jwtConfiguration.passwordResetSecret;

    return this.passwordResetJwt.sign(payload, {
      secret,
      expiresIn: '1h',
    });
  }

  /**
   * 비밀번호 재설정 토큰 검증
   * @param token JWT 토큰
   * @returns 페이로드에서 추출한 이메일
   */
  verifyPasswordResetToken(token: string): { email: string } {
    try {
      const secret = this.jwtConfiguration.secret;
      return this.jwt.verify(token, { secret }) as {
        email: string;
      };
    } catch {
      throw new UnauthorizedException({
        errorCode: ErrorCodes.AUTH_001,
        errorMessage: '유효하지 않거나 만료된 토큰입니다.',
      });
    }
  }

  /**
   * 비밀번호 재설정 이메일 발송
   * @param email 사용자 이메일
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    const token = this.generatePasswordResetToken(email);
    await this.emailService.sendPasswordResetEmail(email, token);
  }
}
