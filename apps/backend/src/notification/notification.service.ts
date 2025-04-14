import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContentType, NotificationMethod } from '@prisma/client';
import {
  CreateNotificationDto,
  UpdateUserNotificationSettingsDto,
} from './dto/notification.dto';
import { ErrorCodes } from '../common/enums/error-codes.enum';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        contentType: dto.contentType as ContentType,
        contentId: dto.contentId,
        userId: dto.userId,
      },
    });
  }

  async getUserNotifications(userId: number, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({
        where: { userId },
      }),
    ]);

    return {
      notifications,
      total,
    };
  }

  async getUnreadNotificationsCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });

    return { count };
  }

  async markAsRead(userId: number, notificationId: number) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '알림을 찾을 수 없습니다.',
      });
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException({
        errorCode: ErrorCodes.AUTHZ_001,
        errorMessage: '접근 권한이 없습니다.',
      });
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });

    return { message: '알림이 읽음으로 표시되었습니다.' };
  }

  async markAllAsRead(userId: number) {
    const { count } = await this.prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
      },
    });

    return {
      message: '모든 알림이 읽음으로 표시되었습니다.',
      count,
    };
  }

  async deleteNotification(id: number) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '알림을 찾을 수 없습니다.',
      });
    }

    return this.prisma.notification.delete({
      where: { id },
    });
  }

  async deleteUserNotification(userId: number, notificationId: number) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '알림을 찾을 수 없습니다.',
      });
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException({
        errorCode: ErrorCodes.AUTHZ_001,
        errorMessage: '알림에 대한 접근 권한이 없습니다.',
      });
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    return { message: '알림이 성공적으로 삭제되었습니다.' };
  }

  // 사용자의 알림 설정 조회
  async getUserNotificationSettings(userId: number) {
    // 사용자의 알림 설정 조회
    const settings = await this.prisma.userNotificationSettings.findUnique({
      where: {
        userId,
      },
    });

    // 설정이 없는 경우 기본값 반환
    if (!settings) {
      return {
        emailEnabled: true,
        pushEnabled: true,
        preferredMethod: 'BOTH',
      };
    }

    return settings;
  }

  // 사용자의 알림 설정 업데이트
  async updateUserNotificationSettings(
    userId: number,
    updateSettingsDto: UpdateUserNotificationSettingsDto,
  ) {
    const { emailEnabled, pushEnabled, preferredMethod } = updateSettingsDto;

    const updatedSettings = await this.prisma.userNotificationSettings.upsert({
      where: {
        userId,
      },
      update: {
        emailEnabled,
        pushEnabled,
        preferredMethod,
      },
      create: {
        userId,
        emailEnabled: emailEnabled ?? true,
        pushEnabled: pushEnabled ?? true,
        preferredMethod: preferredMethod ?? 'BOTH',
      },
    });

    return updatedSettings;
  }

  // 지표 알림 추가 사용자 조회
  async findIndicatorNotifications(indicatorId: number) {
    return this.prisma.indicatorNotification.findMany({
      where: {
        indicatorId,
      },
      include: {
        user: {
          include: {
            notificationSettings: true,
          },
        },
      },
    });
  }

  // 실적 알림 추가 사용자 조회
  async findEarningsNotifications(earningsId: number) {
    return this.prisma.earningsNotification.findMany({
      where: {
        earningsId,
      },
      include: {
        user: {
          include: {
            notificationSettings: true,
          },
        },
      },
    });
  }

  /**
   * 사용자가 특정 경제지표에 대한 알림을 등록합니다.
   * @param userId - 사용자 ID
   * @param indicatorId - 경제지표 ID
   */
  async subscribeIndicator(userId: number, indicatorId: number) {
    // 해당 경제지표가 존재하는지 확인
    const indicator = await this.prisma.economicIndicator.findUnique({
      where: { id: indicatorId },
    });
    if (!indicator) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '해당 경제지표를 찾을 수 없습니다.',
      });
    }

    // 사용자와 경제지표의 복합 유니크 제약조건에 따라 알림 등록 (업서트)
    const notification = await this.prisma.indicatorNotification.upsert({
      where: {
        userId_indicatorId: {
          userId,
          indicatorId,
        },
      },
      update: {},
      create: { userId, indicatorId },
    });

    return {
      message: '경제지표 알림이 성공적으로 등록되었습니다.',
      notification,
    };
  }

  /**
   * 사용자가 특정 실적(Earnings)에 대한 알림을 등록합니다.
   * @param userId - 사용자 ID
   * @param earningsId - 실적 ID
   */
  async subscribeEarnings(userId: number, earningsId: number) {
    // 해당 실적이 존재하는지 확인
    const earnings = await this.prisma.earnings.findUnique({
      where: { id: earningsId },
    });
    if (!earnings) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '해당 실적 정보를 찾을 수 없습니다.',
      });
    }

    // 사용자와 실적의 복합 유니크 제약조건에 따라 알림 등록 (업서트)
    const notification = await this.prisma.earningsNotification.upsert({
      where: {
        userId_earningsId: {
          userId,
          earningsId,
        },
      },
      update: {},
      create: { userId, earningsId },
    });

    return {
      message: '실적 알림이 성공적으로 등록되었습니다.',
      notification,
    };
  }

  /**
   * 사용자가 특정 경제지표에 대한 알림을 취소(삭제)합니다.
   * @param userId - 사용자 ID
   * @param indicatorId - 경제지표 ID
   */
  async unsubscribeIndicator(userId: number, indicatorId: number) {
    // 해당 알림이 존재하는지 확인
    const notification = await this.prisma.indicatorNotification.findUnique({
      where: {
        userId_indicatorId: {
          userId,
          indicatorId,
        },
      },
    });
    if (!notification) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '해당 경제지표에 대한 알림 정보를 찾을 수 없습니다.',
      });
    }

    // 알림 삭제
    await this.prisma.indicatorNotification.delete({
      where: {
        userId_indicatorId: {
          userId,
          indicatorId,
        },
      },
    });

    return { message: '경제지표 알림이 성공적으로 삭제되었습니다.' };
  }

  /**
   * 사용자가 특정 실적(Earnings)에 대한 알림을 취소(삭제)합니다.
   * @param userId - 사용자 ID
   * @param earningsId - 실적 ID
   */
  async unsubscribeEarnings(userId: number, earningsId: number) {
    // 해당 알림이 존재하는지 확인
    const notification = await this.prisma.earningsNotification.findUnique({
      where: {
        userId_earningsId: {
          userId,
          earningsId,
        },
      },
    });
    if (!notification) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '해당 실적에 대한 알림 정보를 찾을 수 없습니다.',
      });
    }

    // 알림 삭제
    await this.prisma.earningsNotification.delete({
      where: {
        userId_earningsId: {
          userId,
          earningsId,
        },
      },
    });

    return { message: '실적 알림이 성공적으로 삭제되었습니다.' };
  }

  /**
   * 사용자가 특정 실적(Earnings)에 대한 알림을 추가합니다.
   * @param userId - 사용자 ID
   * @param earningsId - 실적 ID
   */
  async addEarningsNotification(userId: number, earningsId: number) {
    // 기존 subscribeEarnings와 동일한 기능 - 해당 메서드 활용
    return this.subscribeEarnings(userId, earningsId);
  }

  /**
   * 사용자가 특정 실적(Earnings)에 대한 알림을 제거합니다.
   * @param userId - 사용자 ID
   * @param earningsId - 실적 ID
   */
  async removeEarningsNotification(userId: number, earningsId: number) {
    // 기존 unsubscribeEarnings와 동일한 기능 - 해당 메서드 활용
    return this.unsubscribeEarnings(userId, earningsId);
  }

  /**
   * 사용자가 특정 배당(Dividend)에 대한 알림을 추가합니다.
   * @param userId - 사용자 ID
   * @param dividendId - 배당 ID
   */
  async addDividendNotification(userId: number, dividendId: number) {
    // 해당 배당이 존재하는지 확인
    const dividend = await this.prisma.dividend.findUnique({
      where: { id: dividendId },
    });
    if (!dividend) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '해당 배당 정보를 찾을 수 없습니다.',
      });
    }

    // 이미 알림이 있는지 확인
    const existingNotification = await this.prisma.notification.findFirst({
      where: {
        userId,
        contentId: dividendId,
        contentType: ContentType.DIVIDEND,
      },
    });

    if (existingNotification) {
      return {
        message: '이미 배당 알림이 설정되어 있습니다.',
        notification: existingNotification,
      };
    }

    // Notification 모델에 직접 추가
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        contentId: dividendId,
        contentType: ContentType.DIVIDEND,
        method: NotificationMethod.BOTH, // 기본값
      },
    });

    return {
      message: '배당 알림이 성공적으로 등록되었습니다.',
      notification,
    };
  }

  /**
   * 사용자가 특정 배당(Dividend)에 대한 알림을 제거합니다.
   * @param userId - 사용자 ID
   * @param dividendId - 배당 ID
   */
  async removeDividendNotification(userId: number, dividendId: number) {
    // 알림 확인
    const notification = await this.prisma.notification.findFirst({
      where: {
        userId,
        contentId: dividendId,
        contentType: ContentType.DIVIDEND,
      },
    });

    // 알림이 없는 경우
    if (!notification) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '해당 배당에 대한 알림 설정이 없습니다.',
      });
    }

    // 알림 제거
    await this.prisma.notification.delete({
      where: {
        id: notification.id,
      },
    });

    return {
      message: '배당 알림이 성공적으로 해제되었습니다.',
    };
  }

  /**
   * 사용자가 특정 경제지표에 대한 알림을 추가합니다.
   * @param userId - 사용자 ID
   * @param indicatorId - 경제지표 ID
   */
  async addEconomicIndicatorNotification(userId: number, indicatorId: number) {
    // 기존 subscribeIndicator와 동일한 기능 - 해당 메서드 활용
    return this.subscribeIndicator(userId, indicatorId);
  }

  /**
   * 사용자가 특정 경제지표에 대한 알림을 제거합니다.
   * @param userId - 사용자 ID
   * @param indicatorId - 경제지표 ID
   */
  async removeEconomicIndicatorNotification(
    userId: number,
    indicatorId: number,
  ) {
    // 기존 unsubscribeIndicator와 동일한 기능 - 해당 메서드 활용
    return this.unsubscribeIndicator(userId, indicatorId);
  }

  // 알림 설정된 캘린더 정보 조회
  async getNotificationCalendar(userId: number) {
    // 알림 설정된 경제지표 조회
    const indicatorNotifications =
      await this.prisma.indicatorNotification.findMany({
        where: { userId },
        include: {
          indicator: true,
        },
        orderBy: {
          indicator: {
            releaseDate: 'desc',
          },
        },
      });

    // 알림 설정된 실적 조회
    const earningsNotifications =
      await this.prisma.earningsNotification.findMany({
        where: { userId },
        include: {
          earnings: {
            include: {
              company: true,
            },
          },
        },
        orderBy: {
          earnings: {
            releaseDate: 'desc',
          },
        },
      });

    // 응답 데이터 형식 변환
    const economicIndicators = indicatorNotifications.map((notification) => ({
      id: notification.indicator.id,
      name: notification.indicator.name,
      country: notification.indicator.country,
      importance: notification.indicator.importance,
      releaseDate: Number(notification.indicator.releaseDate),
      actual: notification.indicator.actual,
      forecast: notification.indicator.forecast,
      previous: notification.indicator.previous,
      hasNotification: true,
    }));

    const earnings = earningsNotifications.map((notification) => ({
      id: notification.earnings.id,
      company: {
        id: notification.earnings.company.id,
        ticker: notification.earnings.company.ticker,
        name: notification.earnings.company.name,
      },
      country: notification.earnings.country,
      releaseDate: Number(notification.earnings.releaseDate),
      releaseTiming: notification.earnings.releaseTiming,
      actualEPS: notification.earnings.actualEPS,
      forecastEPS: notification.earnings.forecastEPS,
      previousEPS: notification.earnings.previousEPS,
      actualRevenue: notification.earnings.actualRevenue,
      forecastRevenue: notification.earnings.forecastRevenue,
      previousRevenue: notification.earnings.previousRevenue,
      hasNotification: true,
    }));

    return {
      economicIndicators,
      earnings,
    };
  }
}
