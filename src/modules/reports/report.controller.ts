import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { User } from '../users/user.entity';
import {
  FleetActivityExportFormat,
  FleetActivityExportQueryDto,
  FleetActivityQueryDto,
} from './report.dto';
import { ReportService } from './report.service';

interface ExportPayload {
  filename: string;
  mimeType: string;
  base64: string;
}

@Controller('reports')
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Get('fleet-activity')
  @RequiresPermissions('reports.read')
  getFleetActivity(
    @CurrentUser() user: User,
    @Query() query: FleetActivityQueryDto,
  ) {
    return this.reports.buildFleetActivity(user, query);
  }

  /**
   * Returns the export as base64 inside a JSON envelope rather than a raw
   * binary stream. This keeps the response `application/json`, which prevents
   * browser download managers (e.g. IDM) from intercepting the request and
   * stripping CORS headers. The client decodes the base64 into a Blob and
   * triggers the actual file download locally.
   */
  @Get('fleet-activity/export')
  @RequiresPermissions('reports.export')
  async exportFleetActivity(
    @CurrentUser() user: User,
    @Query() query: FleetActivityExportQueryDto,
  ): Promise<ExportPayload> {
    let buffer: Buffer;
    let snapshotForName: Awaited<
      ReturnType<typeof this.reports.buildFleetActivity>
    >;

    if (query.format === FleetActivityExportFormat.XLSX) {
      const detailed = await this.reports.buildDetailed(user, query);
      snapshotForName = detailed.snapshot;
      buffer = await this.reports.toXlsx(detailed);
    } else {
      snapshotForName = await this.reports.buildFleetActivity(user, query);
      buffer = await this.reports.toPdf(snapshotForName);
    }

    return {
      filename: this.reports.buildExportFilename(snapshotForName, query.format),
      mimeType: this.reports.getExportContentType(query.format),
      base64: buffer.toString('base64'),
    };
  }
}
