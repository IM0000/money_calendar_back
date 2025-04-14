// users.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { RandomNickList } from '../common/random-nick.constants';
import { EmailService } from '../email/email.service';
import { UserDto } from '../auth/dto/users.dto';
import { ErrorCodes } from '../common/enums/error-codes.enum';
import { generateSixDigitCode } from '../utils/code-generator';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/profile.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async findUserByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { email },
    });
  }

  async linkOAuthAccountToUser(
    user: User,
    provider: string,
    providerId: string,
  ): Promise<User> {
    return await this.prisma.user.update({
      where: { id: user.id },
      data: {
        oauthAccounts: {
          create: {
            provider,
            providerId,
          },
        },
      },
      include: {
        oauthAccounts: true,
      },
    });
  }

  // ID로 사용자 찾기 (JWT 검증 시 사용)
  async findUserById(userId: number): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  // OAuth 제공자와 제공자 ID로 사용자 찾기
  async findUserByOAuthId(
    provider: string,
    providerId: string,
  ): Promise<User | null> {
    return await this.prisma.user.findFirst({
      where: {
        oauthAccounts: {
          some: {
            provider,
            providerId,
          },
        },
      },
      include: {
        oauthAccounts: true, // OAuth 정보도 함께 가져오기
      },
    });
  }

  /**
   * 이메일 토큰으로 이메일 찾기
   * @param token 이메일 토큰
   * @returns 이메일 주소
   */
  async findEmailFromVerificationToken(token: string): Promise<string> {
    const verification = await this.prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verification || verification.expiresAt < new Date()) {
      throw new BadRequestException({
        errorCode: ErrorCodes.AUTH_002,
        errorMessage: '유효하지 않은 토큰입니다.',
      });
    }

    return verification.email;
  }

  // OAuth 사용자 생성
  async createUserFromOAuth(oauthUser: any): Promise<User> {
    const nickname =
      RandomNickList[Math.floor(Math.random() * RandomNickList.length)];
    return await this.prisma.user.create({
      data: {
        email: oauthUser.email,
        nickname: nickname + new Date().getTime(),
        verified: true, // OAuth 가입자는 이메일 인증 생략
        oauthAccounts: {
          create: [
            {
              provider: oauthUser.provider,
              providerId: oauthUser.providerId,
            },
          ],
        },
      },
      include: {
        oauthAccounts: true, // 생성된 OAuth 정보도 포함해서 반환
      },
    });
  }

  // 유저 비밀번호 업데이트
  async updateUserPassword(email: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '해당 이메일의 사용자를 찾을 수 없습니다.',
      });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });
  }

  /**
   * 기존 사용자 계정에 OAuth 계정 연동
   * @param userId 연동할 사용자 ID
   * @param oauthUser OAuth 사용자 정보
   * @returns 연동된 사용자 정보
   */
  async linkOAuthAccount(userId: number, oauthUser: any): Promise<User> {
    // 1. 해당 OAuth 계정이 이미 다른 사용자에 연동되어 있는지 확인
    const existingOAuthAccount = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerId: {
          provider: oauthUser.provider,
          providerId: oauthUser.providerId,
        },
      },
    });

    if (existingOAuthAccount) {
      throw new ConflictException({
        errorCode: ErrorCodes.CONFLICT_001,
        errorMessage: `해당 OAuth 계정(${oauthUser.provider})은 이미 다른 사용자에 연동되어 있습니다.`,
      });
    }

    // 2. 사용자가 존재하는지 확인
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '사용자를 찾을 수 없습니다.',
      });
    }

    // 3. OAuth 계정 연동
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        oauthAccounts: {
          create: {
            provider: oauthUser.provider,
            providerId: oauthUser.providerId,
            oauthEmail: oauthUser.email,
          },
        },
      },
      include: {
        oauthAccounts: true, // 연동된 OAuth 정보 포함
      },
    });

    return updatedUser;
  }

  /**
   * 이메일로 사용자 생성
   * @param email 이메일 주소
   * @param password 비밀번호
   */
  async createUserByEmail(email: string, password?: string): Promise<User> {
    const existingUser = await this.findUserByEmail(email);
    if (existingUser) {
      throw new ConflictException({
        errorCode: ErrorCodes.CONFLICT_001,
        errorMessage: '이미 사용 중인 이메일입니다.',
        data: existingUser,
      });
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const nickname = `${
      RandomNickList[Math.floor(Math.random() * RandomNickList.length)]
    }${new Date().getTime()}`;

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        nickname,
        verified: true, // 이메일 인증 완료 후 생성
      },
    });
    return user;
  }

  /**
   * 이메일로 인증 코드 발송
   * @param email 이메일 주소
   */
  async sendVerificationCode(email: string): Promise<void> {
    this.logger.log(email);
    // 인증 코드 생성
    const code = generateSixDigitCode(); // 숫자 6자리
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분 후 만료

    // 기존 인증 코드 삭제
    await this.prisma.verificationCode.deleteMany({
      where: { email },
    });

    // 새 인증 코드 저장
    await this.prisma.verificationCode.create({
      data: {
        email,
        code,
        expiresAt,
      },
    });

    // 인증 안된 유저 객체 생성
    const user = this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      await this.prisma.user.create({
        data: {
          email,
          verified: false,
        },
      });
    }

    // 이메일 전송
    await this.emailService.sendMemberJoinVerification(email, code);
    this.logger.log(email, code);
  }

  /**
   * 인증 코드 검증
   * @param email 이메일 주소
   * @param code 인증 코드
   */
  async verifyEmailCode(email: string, code: string): Promise<UserDto> {
    const verification = await this.prisma.verificationCode.findUnique({
      where: { email },
    });
    this.logger.log(verification);
    if (!verification || verification.code !== code) {
      throw new BadRequestException({
        errorCode: ErrorCodes.AUTH_002,
        errorMessage: '유효하지 않은 인증 코드입니다.',
      });
    }

    if (verification.expiresAt < new Date()) {
      throw new BadRequestException({
        errorCode: ErrorCodes.AUTH_001,
        errorMessage: '인증 코드가 만료되었습니다.',
      });
    }

    // 인증 완료 처리 (계정 생성)
    const user = await this.createUserByEmail(email);
    this.logger.log(user);
    if (user) {
      await this.prisma.user.update({
        where: { email },
        data: { verified: true },
      });
    }
    return user;
  }

  /**
   * 이메일 토큰 저장, 제한시간 5분
   * @param token 이메일 토큰
   * @param email 이메일
   */
  async storeVerificationToken(token: string, email: string): Promise<void> {
    this.logger.log(token, email);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 후 만료
    const result = await this.prisma.verificationToken.create({
      data: {
        token,
        email,
        expiresAt,
      },
    });
  }

  /**
   * 사용자 프로필 조회
   */
  async getUserProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        oauthAccounts: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '사용자를 찾을 수 없습니다.',
      });
    }

    // 클라이언트에 반환할 데이터 형식으로 가공
    const providers = ['google', 'kakao', 'apple', 'discord'];
    const oauthConnections = providers.map((provider) => {
      const isConnected = user.oauthAccounts.some(
        (account) => account.provider.toLowerCase() === provider,
      );
      const oauthEmail = user.oauthAccounts.filter(
        (account) => account.provider.toLowerCase() === provider,
      )[0]?.oauthEmail;
      return { provider, connected: isConnected, oauthEmail };
    });

    const hasPassword = user.password !== null;

    return {
      id: user.id,
      email: user.email,
      hasPassword,
      nickname: user.nickname,
      verified: user.verified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      oauthConnections,
    };
  }

  /**
   * 사용자 프로필 업데이트
   */
  async updateUserProfile(userId: number, updateProfileDto: UpdateProfileDto) {
    // 사용자 존재 확인
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '사용자를 찾을 수 없습니다.',
      });
    }

    // 닉네임 업데이트
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...updateProfileDto,
      },
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      nickname: updatedUser.nickname,
      verified: updatedUser.verified,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };
  }

  /**
   * 사용자 비밀번호 변경
   */
  async changeUserPassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    // 사용자 존재 확인
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '사용자를 찾을 수 없습니다.',
      });
    }

    if (currentPassword && currentPassword !== '') {
      // 현재 비밀번호 확인
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password,
      );
      if (!isPasswordValid) {
        throw new BadRequestException({
          errorCode: ErrorCodes.BAD_REQUEST_002,
          errorMessage: '현재 비밀번호가 일치하지 않습니다.',
        });
      }
    }

    // 새 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 비밀번호 업데이트
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });

    return { message: '비밀번호가 성공적으로 변경되었습니다.' };
  }

  /**
   * 사용자 비밀번호 확인
   * @param userId 사용자 ID
   * @param password 확인할 비밀번호
   * @returns 비밀번호 일치 여부
   */
  async verifyUserPassword(userId: number, password: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '사용자를 찾을 수 없습니다.',
      });
    }

    // 비밀번호가 설정되지 않은 경우 (OAuth 계정)
    if (!user.password) {
      throw new BadRequestException({
        errorCode: ErrorCodes.BAD_REQUEST_001,
        errorMessage: '비밀번호가 설정되어 있지 않은 계정입니다.',
      });
    }

    // 비밀번호 비교
    const isPasswordValid = await bcrypt.compare(password, user.password);
    return isPasswordValid;
  }

  // 에러 로깅 개선을 위한 공통 함수 추가
  private logError(methodName: string, error: any, params?: any) {
    this.logger.error(`Error in UsersService.${methodName}: ${error.message}`, {
      service: 'UsersService',
      method: methodName,
      error: error.stack || error.message,
      params: params ? JSON.stringify(params) : undefined,
    });
    return error;
  }

  /**
   * OAuth 계정 연결 해제
   */
  async disconnectOAuthAccount(userId: number, provider: string) {
    // 연결된 모든 계정 조회
    const connectedAccounts = await this.prisma.oAuthAccount.findMany({
      where: { userId },
    });

    // 최소 하나의 로그인 방법 유지 확인
    if (connectedAccounts.length <= 1) {
      throw new BadRequestException({
        errorCode: ErrorCodes.BAD_REQUEST_001,
        errorMessage:
          '최소 하나의 로그인 방법이 필요합니다. 소셜 계정 연결을 해제할 수 없습니다.',
      });
    }

    // 해당 프로바이더의 연결 제거
    await this.prisma.oAuthAccount.deleteMany({
      where: {
        userId,
        provider,
      },
    });
    return { message: `${provider} 계정 연결이 해제되었습니다.` };
  }

  /**
   * 계정 탈퇴
   */
  async deleteUser(userId: number, email: string, password: string) {
    // 사용자 존재 확인
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        oauthAccounts: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '사용자를 찾을 수 없습니다.',
      });
    }

    // 이메일 일치 확인
    if (user.email !== email) {
      throw new BadRequestException({
        errorCode: ErrorCodes.BAD_REQUEST_002,
        errorMessage: '이메일이 일치하지 않습니다.',
      });
    }

    // // 계정 삭제 - 관련된 모든 데이터 삭제
    // // OAuth 계정 먼저 삭제
    // await this.prisma.oAuthAccount.deleteMany({
    //   where: { userId: user.id },
    // });

    // // 알림 설정 삭제
    // await this.prisma.userNotificationSettings.deleteMany({
    //   where: { userId: user.id },
    // });

    // // 알림 삭제
    // await this.prisma.notification.deleteMany({
    //   where: { userId: user.id },
    // });

    // // 사용자 삭제
    // await this.prisma.user.delete({
    //   where: { id: user.id },
    // });

    return { message: '계정이 성공적으로 삭제되었습니다.' };
  }
}
