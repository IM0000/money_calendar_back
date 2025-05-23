import { jwtConfig } from '../../config/jwt.config';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigType } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { ErrorCodes } from '../../common/enums/error-codes.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(jwtConfig.KEY)
    private jwtConfiguration: ConfigType<typeof jwtConfig>,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Authorization 헤더에서 토큰 추출
      ignoreExpiration: false, // 만료된 토큰을 무시하지 않음
      secretOrKey: jwtConfiguration.secret, // 비밀 키 설정
    });
  }

  /**
   * JWT 토큰이 유효하면 호출되는 메서드
   * @param payload JWT 페이로드
   * @returns 사용자 정보
   */
  async validate(payload: any) {
    const user = await this.usersService.findUserById(payload.sub); // sub는 사용자 ID
    if (!user) {
      throw new UnauthorizedException({
        errorCode: ErrorCodes.AUTHZ_001,
        errorMessage: '유효하지 않은 토큰입니다.',
      });
    }

    const { password, ...userWithoutPassword } = user;

    return userWithoutPassword; // Request에 사용자 정보 저장
  }
}
