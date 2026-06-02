import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  DIGEST_PERMISSION_SLUG,
  ReportsDigestService,
} from './reports-digest.service';

@Controller('reports/digest')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsDigestController {
  constructor(private readonly digest: ReportsDigestService) {}

  /** Manual trigger so admins can validate digest delivery. */
  @Post('run')
  @RequiresPermissions(DIGEST_PERMISSION_SLUG)
  @HttpCode(HttpStatus.ACCEPTED)
  async runNow(): Promise<{ recipients: number }> {
    const result = await this.digest.run();
    return { recipients: result.recipients };
  }
}
