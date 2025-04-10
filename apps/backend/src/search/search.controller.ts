import { Controller, Get, Query, Request } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchCompanyDto, SearchIndicatorDto } from './dto/search.dto';

@Controller('api/v1/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * 기업 검색
   * GET /search/companies?query=apple&country=US&page=1&limit=10
   */
  @Get('companies')
  async searchCompanies(@Query() searchDto: SearchCompanyDto, @Request() req) {
    // 인증된 사용자가 있다면 ID 추출
    const userId = req.user?.id;

    return await this.searchService.searchCompanies(searchDto, userId);
  }

  /**
   * 경제지표 검색
   * GET /search/indicators?query=cpi&country=US&page=1&limit=10
   */
  @Get('indicators')
  async searchIndicators(
    @Query() searchDto: SearchIndicatorDto,
    @Request() req,
  ) {
    // 인증된 사용자가 있다면 ID 추출
    const userId = req.user?.id;

    return await this.searchService.searchIndicators(searchDto, userId);
  }
}
