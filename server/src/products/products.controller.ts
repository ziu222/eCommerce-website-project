import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import {
  AdminListProductsQuery,
  CreateProductDto,
  ListProductsQuery,
  ProductNoteDto,
  ReviewProductDto,
  UpdateProductDto,
} from './dto/product.dto.js';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsQuery) {
    return this.products.list(query);
  }

  // Declared before ':id' so "categories" is not parsed as an id.
  @Get('categories')
  categories() {
    return this.products.categories();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.products.detail(id);
  }
}

@Controller('shop/products')
@Roles('shop')
export class ShopProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.products.listOwn(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.products.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.products.remove(user.id, id);
  }
}

@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermission('products.view')
  list(@Query() query: AdminListProductsQuery) {
    return this.products.adminList(query);
  }

  @Get('stats')
  @RequirePermission('products.view')
  stats() {
    return this.products.stats();
  }

  @Post(':id/review')
  @RequirePermission('products.manage')
  review(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReviewProductDto) {
    return this.products.review(id, user.username, dto.decision, dto.note);
  }

  @Post(':id/suspend')
  @RequirePermission('products.manage')
  suspend(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ProductNoteDto) {
    return this.products.suspend(id, user.username, dto.note);
  }

  @Post(':id/restore')
  @RequirePermission('products.manage')
  restore(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.products.restore(id, user.username);
  }
}
