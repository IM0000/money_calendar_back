import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from './notification.service';
import { EmailService } from '../email/email.service';
import { ContentType } from '@prisma/client';
import { SendNotificationEmailDto } from './dto/notification.dto';
import { UsersService } from '../users/users.service';
import { ErrorCodes } from '../common/enums/error-codes.enum';

@Injectable()
export class NotificationListener {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
  ) {}

  @OnEvent('indicator.actualChanged')
  async handleIndicatorChanged({ before, after }) {
    console.log('EconomicIndicator actual 값 변경 감지:', { before, after });

    // 해당 지표에 알림을 추가한 사용자 조회
    const notifications =
      await this.notificationService.findIndicatorNotifications(before.id);

    // 각 사용자별로 알림 생성
    for (const notification of notifications) {
      // 사용자의 알림 설정 조회
      const userSettings =
        await this.notificationService.getUserNotificationSettings(
          notification.userId,
        );

      // 알림 생성
      const noti = await this.notificationService.createNotification({
        contentType: ContentType.ECONOMIC_INDICATOR,
        contentId: before.id,
        userId: notification.userId,
      });

      // 이메일 알림 발송
      if (
        userSettings.emailEnabled &&
        (userSettings.preferredMethod === 'EMAIL' ||
          userSettings.preferredMethod === 'BOTH')
      ) {
        if (!notification.user) {
          throw new NotFoundException({
            errorCode: ErrorCodes.RESOURCE_001,
            errorMessage: '유저 정보가 없습니다.',
          });
        }

        const emailDto: SendNotificationEmailDto = {
          email: notification.user.email,
          subject: `${before.name} 지표 업데이트 알림`,
          content: `${before.name}의 실제값이 ${before.actual}에서 ${after.actual}로 변경되었습니다.`,
        };
        await this.emailService.sendNotificationEmail(emailDto);
      }
    }
  }

  @OnEvent('earnings.actualChanged')
  async handleEarningsChanged({ before, after }) {
    console.log('Earnings actual 값 변경 감지:', { before, after });

    // 해당 실적에 알림을 추가한 사용자 조회
    const notifications =
      await this.notificationService.findEarningsNotifications(before.id);

    // 각 사용자별로 알림 생성
    for (const notification of notifications) {
      // 사용자의 알림 설정 조회
      const userSettings =
        await this.notificationService.getUserNotificationSettings(
          notification.userId,
        );

      // 알림 생성
      const noti = await this.notificationService.createNotification({
        contentType: ContentType.EARNINGS,
        contentId: before.id,
        userId: notification.userId,
      });

      // 이메일 알림 발송
      if (
        userSettings.emailEnabled &&
        (userSettings.preferredMethod === 'EMAIL' ||
          userSettings.preferredMethod === 'BOTH')
      ) {
        if (!notification.user) {
          throw new NotFoundException({
            errorCode: ErrorCodes.RESOURCE_001,
            errorMessage: '유저 정보가 없습니다.',
          });
        }

        const emailDto: SendNotificationEmailDto = {
          email: notification.user.email,
          subject: `${before.company.name} 실적 업데이트 알림`,
          content: `${before.company.name}의 실적이 업데이트되었습니다. 
          EPS : ${after.actualEPS}, 매출 : ${after.actualRevenue}`,
        };
        await this.emailService.sendNotificationEmail(emailDto);
      }
    }
  }
}
