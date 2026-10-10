import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { AccountService } from './account.service.js';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';

/** The customer's own address book, saved products and membership tier. */
@Controller('users/me')
@Roles('customer')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('addresses')
  addresses(@CurrentUser() user: SessionUser) {
    return this.account.listAddresses(user.id);
  }

  @Post('addresses')
  addAddress(@CurrentUser() user: SessionUser, @Body() dto: CreateAddressDto) {
    return this.account.addAddress(user.id, dto);
  }

  @Patch('addresses/:id')
  updateAddress(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAddressDto) {
    return this.account.updateAddress(user.id, id, dto);
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  removeAddress(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.account.removeAddress(user.id, id);
  }

  @Get('wishlist')
  wishlist(@CurrentUser() user: SessionUser) {
    return this.account.wishlist(user.id);
  }

  @Get('wishlist/ids')
  wishlistIds(@CurrentUser() user: SessionUser) {
    return this.account.wishlistIds(user.id);
  }

  @Put('wishlist/:productId')
  @HttpCode(204)
  save(@CurrentUser() user: SessionUser, @Param('productId', ParseIntPipe) productId: number) {
    return this.account.save(user.id, productId);
  }

  @Delete('wishlist/:productId')
  @HttpCode(204)
  unsave(@CurrentUser() user: SessionUser, @Param('productId', ParseIntPipe) productId: number) {
    return this.account.unsave(user.id, productId);
  }

  @Get('membership')
  membership(@CurrentUser() user: SessionUser) {
    return this.account.membership(user.id);
  }
}
