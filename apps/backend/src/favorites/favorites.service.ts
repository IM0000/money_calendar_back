import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  convertDividendBigInt,
  convertEarningsBigInt,
  convertEconomicIndicatorBigInt,
} from '../utils/convert-bigint';
import { ErrorCodes } from '../common/enums/error-codes.enum';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllFavorites(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        favoriteEarnings: {
          include: {
            earnings: {
              include: {
                company: true,
              },
            },
          },
        },
        favoriteDividends: {
          include: {
            dividend: {
              include: {
                company: true,
              },
            },
          },
        },
        favoriteIndicators: {
          include: {
            indicator: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_001,
        errorMessage: '사용자를 찾을 수 없습니다.',
      });
    }

    return {
      earnings: convertEarningsBigInt(
        user.favoriteEarnings.map((fav) => fav.earnings),
      ).map((item) => ({
        ...item,
        country: item.country,
        company: {
          ...item.company,
          companyCountry: item.company.country,
        },
      })),
      dividends: convertDividendBigInt(
        user.favoriteDividends.map((fav) => fav.dividend),
      ).map((item) => ({
        ...item,
        country: item.country,
        exDividendDate: Number(item.exDividendDate),
        paymentDate: Number(item.paymentDate),
        company: {
          ...item.company,
          companyCountry: item.company.country,
        },
      })),
      economicIndicators: convertEconomicIndicatorBigInt(
        user.favoriteIndicators.map((fav) => fav.indicator),
      ).map((item) => ({
        ...item,
        country: item.country,
        releaseDate: Number(item.releaseDate),
      })),
    };
  }

  /**
   * 사용자가 즐겨찾기한 일정만 기간별로 조회
   */
  async getFavoriteCalendarEvents(
    userId: number,
    startTimestamp: number,
    endTimestamp: number,
  ) {
    // 사용자의 즐겨찾기한 실적 정보 조회
    const favoriteEarnings = await this.prisma.earnings.findMany({
      where: {
        releaseDate: {
          gte: startTimestamp,
          lte: endTimestamp,
        },
        favorites: {
          some: {
            userId,
          },
        },
      },
      include: {
        company: true,
      },
    });

    // 사용자의 즐겨찾기한 배당 정보 조회
    const favoriteDividends = await this.prisma.dividend.findMany({
      where: {
        exDividendDate: {
          gte: startTimestamp,
          lte: endTimestamp,
        },
        favorites: {
          some: {
            userId,
          },
        },
      },
      include: {
        company: true,
      },
    });

    // 사용자의 즐겨찾기한 경제지표 정보 조회
    const favoriteIndicators = await this.prisma.economicIndicator.findMany({
      where: {
        releaseDate: {
          gte: startTimestamp,
          lte: endTimestamp,
        },
        favorites: {
          some: {
            userId,
          },
        },
      },
    });

    return {
      earnings: convertEarningsBigInt(favoriteEarnings).map((item) => ({
        ...item,
        country: item.country,
        company: {
          ...item.company,
          companyCountry: item.company.country,
        },
      })),
      dividends: convertDividendBigInt(favoriteDividends).map((item) => ({
        ...item,
        country: item.country,
        exDividendDate: Number(item.exDividendDate),
        paymentDate: Number(item.paymentDate),
        company: {
          ...item.company,
          companyCountry: item.company.country,
        },
      })),
      economicIndicators: convertEconomicIndicatorBigInt(
        favoriteIndicators,
      ).map((item) => ({
        ...item,
        country: item.country,
        releaseDate: Number(item.releaseDate),
      })),
    };
  }

  async addFavoriteEarnings(userId: number, earningsId: number) {
    // 이미 존재하는지 확인
    const existingFavorite = await this.prisma.favoriteEarnings.findUnique({
      where: {
        userId_earningsId: {
          userId,
          earningsId,
        },
      },
    });

    if (existingFavorite) {
      return { message: '이미 즐겨찾기에 추가되어 있습니다.' };
    }

    await this.prisma.favoriteEarnings.create({
      data: {
        userId,
        earningsId,
      },
    });

    return { message: '즐겨찾기에 성공적으로 추가되었습니다.' };
  }

  async removeFavoriteEarnings(userId: number, earningsId: number) {
    await this.prisma.favoriteEarnings.delete({
      where: {
        userId_earningsId: {
          userId,
          earningsId,
        },
      },
    });

    return { message: '즐겨찾기에서 성공적으로 제거되었습니다.' };
  }

  async addFavoriteDividends(userId: number, dividendId: number) {
    // 이미 존재하는지 확인
    const existingFavorite = await this.prisma.favoriteDividends.findUnique({
      where: {
        userId_dividendId: {
          userId,
          dividendId,
        },
      },
    });

    if (existingFavorite) {
      return { message: '이미 즐겨찾기에 추가되어 있습니다.' };
    }

    await this.prisma.favoriteDividends.create({
      data: {
        userId,
        dividendId,
      },
    });

    return { message: '즐겨찾기에 성공적으로 추가되었습니다.' };
  }

  async removeFavoriteDividends(userId: number, dividendId: number) {
    await this.prisma.favoriteDividends.delete({
      where: {
        userId_dividendId: {
          userId,
          dividendId,
        },
      },
    });

    return { message: '즐겨찾기에서 성공적으로 제거되었습니다.' };
  }

  async addFavoriteIndicator(userId: number, indicatorId: number) {
    // 이미 존재하는지 확인
    const existingFavorite = await this.prisma.favoriteIndicator.findUnique({
      where: {
        userId_indicatorId: {
          userId,
          indicatorId,
        },
      },
    });

    if (existingFavorite) {
      return { message: '이미 즐겨찾기에 추가되어 있습니다.' };
    }

    await this.prisma.favoriteIndicator.create({
      data: {
        userId,
        indicatorId,
      },
    });

    return { message: '즐겨찾기에 성공적으로 추가되었습니다.' };
  }

  async removeFavoriteIndicator(userId: number, indicatorId: number) {
    await this.prisma.favoriteIndicator.delete({
      where: {
        userId_indicatorId: {
          userId,
          indicatorId,
        },
      },
    });

    return { message: '즐겨찾기에서 성공적으로 제거되었습니다.' };
  }
}
