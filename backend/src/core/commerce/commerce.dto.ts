/**
 * ============================================================================
 * 商城接口的入参校验 DTO
 * ----------------------------------------------------------------------------
 * 所有请求体都通过 class-validator 装饰器做「入口即校验」，
 * 非法数据在进入 Service 之前就会被拦截并返回 400，Service 层因此可以假定
 * 入参在结构上已经合法（但仍需做业务性校验，如库存、优惠码有效性等）。
 *
 * 约定：
 *   - 金额字段（price / stock / percent / minimum）一律为整数，单位为美分或件。
 *   - 所有长度上限都显式声明，避免超长字符串写入数据库。
 *   - 枚举字段（state / category / carrier / status）用 @IsIn 白名单约束。
 * ============================================================================
 */

import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, Equals, IsArray, IsBoolean, IsDefined, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

/** 美国 50 州缩写白名单——本商城仅配送美国本土，收货地址的州必须是其中之一。 */
export const US_STATES = 'AL AZ AR CA CO CT DE FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');

/** 商品品类白名单，与 CategoryHandlerRegistry 中注册的处理器键保持一致。 */
export const CATEGORIES = ['non-powered', 'powered'];

/** 购物车单行：变体 ID + 数量（单行数量 1~10，超出由 Service 再次合并校验）。 */
export class CartLineDto {
  @IsString() @MaxLength(100) variantId: string;
  @IsInt() @Min(1) @Max(10) quantity: number;
}

/** 报价入参：1~20 行商品，可选优惠码。 */
export class QuoteDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CartLineDto) items: CartLineDto[];
  @IsOptional() @IsString() @MaxLength(40) coupon?: string;
}

/**
 * 收货地址（仅美国本土）。
 * country 固定为 'US'（@Equals 强制），zip 需匹配 5 位或 9 位美国邮编格式。
 */
export class AddressDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsString() @MinLength(3) @MaxLength(150) line1: string;
  @IsOptional() @IsString() @MaxLength(150) line2?: string;
  @IsString() @MinLength(2) @MaxLength(80) city: string;
  @IsIn(US_STATES) state: string;
  @Matches(/^\d{5}(-\d{4})?$/) zip: string;
  @Equals('US') country: string;
}

/**
 * 结账入参：在报价基础上增加邮箱、地址、幂等键与合规勾选。
 *   - idempotencyKey 必须是 UUID v4，由客户端生成，用于服务端幂等去重。
 *   - adult / terms 必须为 true——成年声明与条款同意是下单的强制前提，
 *     不允许缺省或为 false。
 */
export class CheckoutDto extends QuoteDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsDefined() @ValidateNested() @Type(() => AddressDto) address: AddressDto;
  @IsUUID('4') idempotencyKey: string;
  @Equals(true) adult: boolean;
  @Equals(true) terms: boolean;
}

/** 游客找单入参：订单号 + 邮箱，二者需同时匹配。 */
export class RecoveryDto {
  @IsString() @MaxLength(80) number: string;
  @IsEmail() @MaxLength(254) email: string;
}

/** 售后申请入参：退货原因（10~2000 字符，太短不具备审核信息量）。 */
export class ReturnDto {
  @IsString() @MinLength(10) @MaxLength(2000) reason: string;
}

/**
 * 商品变体入参。
 *   - id 为空表示新建变体；有 id 表示更新，此时 version 必填（由 Service 做乐观锁校验，
 *     此处只限制为非负整数）。
 *   - price / stock 为整数，上限 1,000,000（美分 / 件），防止误填天文数字。
 */
export class VariantDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsInt() @Min(0) version?: number;
  @Matches(/^[A-Za-z0-9_-]{2,60}$/) sku: string;
  @IsString() @MinLength(1) @MaxLength(100) label: string;
  @IsInt() @Min(1) @Max(1000000) price: number;
  @IsInt() @Min(0) @Max(1000000) stock: number;
  @IsBoolean() active: boolean;
}

/**
 * 商品入参（后台新建/更新共用）。
 *   - slug 必须是 kebab-case（小写字母数字 + 连字符），作为对外 URL 标识。
 *   - images 最多 8 张，元素为 HTTPS 直链（协议校验在 Service 层执行）。
 *   - demo=true 表示演示商品，live 模式下不会对外展示、也不可下单。
 *   - variants 至少 1 个、最多 30 个。
 */
export class ProductDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(100) slug: string;
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsIn(CATEGORIES) category: string;
  @IsString() @MinLength(10) @MaxLength(5000) description: string;
  @IsString() @MaxLength(1000) material: string;
  @IsString() @MaxLength(1000) dimensions: string;
  @IsString() @MaxLength(2000) care: string;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) images: string[];
  @IsBoolean() active: boolean;
  @IsBoolean() demo: boolean;
  @IsBoolean() featured: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => VariantDto) variants: VariantDto[];
}

/**
 * 优惠码入参。
 *   - code 为大写字母/数字/下划线/连字符，3~40 位。
 *   - percent 为折扣百分比（1~80，即最多打掉八成，避免 100% 免单误配）。
 *   - minimum 为最低消费门槛（美分）。
 *   - expiresAt 为可选 ISO8601 时间字符串，留空表示永不过期。
 */
export class CouponDto {
  @Matches(/^[A-Z0-9_-]{3,40}$/) code: string;
  @IsInt() @Min(1) @Max(80) percent: number;
  @IsInt() @Min(0) @Max(1000000) minimum: number;
  @IsBoolean() active: boolean;
  @IsOptional() @IsISO8601() expiresAt?: string;
}

/** 发货入参：承运商白名单 + 运单号格式。 */
export class ShipmentDto {
  @IsIn(['USPS', 'UPS', 'FedEx', 'Other']) carrier: string;
  @Matches(/^[A-Za-z0-9 -]{5,80}$/) trackingNumber: string;
}

/**
 * 售后状态流转入参。
 * 仅允许提交目标状态，合法流转路径由 Service 的状态机白名单判定
 * （requested→approved/rejected，approved→received）。
 */
export class ReturnUpdateDto {
  @IsIn(['approved', 'rejected', 'received']) status: string;
  @IsString() @MinLength(2) @MaxLength(2000) note: string;
}

/**
 * 退款登记入参。
 *   - reference：Stripe 退款 ID 或线下退款凭证号（live 模式下会通过 Stripe 核验）。
 *   - restock：是否把商品重新计入可售库存（已发货订单需先确认收到退货）。
 */
export class RefundDto {
  @IsString() @MinLength(5) @MaxLength(150) reference: string;
  @IsBoolean() restock: boolean;
}
