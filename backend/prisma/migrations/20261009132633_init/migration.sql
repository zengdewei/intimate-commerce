-- CreateTable
CREATE TABLE `StoreProduct` (
    `id` VARCHAR(30) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `category` VARCHAR(40) NOT NULL,
    `description` TEXT NOT NULL,
    `material` VARCHAR(200) NOT NULL DEFAULT '',
    `dimensions` VARCHAR(200) NOT NULL DEFAULT '',
    `care` TEXT NOT NULL,
    `images` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `demo` BOOLEAN NOT NULL DEFAULT true,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StoreProduct_slug_key`(`slug`),
    INDEX `StoreProduct_category_active_idx`(`category`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreVariant` (
    `id` VARCHAR(30) NOT NULL,
    `productId` VARCHAR(30) NOT NULL,
    `sku` VARCHAR(60) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `price` INTEGER NOT NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `StoreVariant_sku_key`(`sku`),
    INDEX `StoreVariant_productId_active_idx`(`productId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreOrder` (
    `id` VARCHAR(30) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `userId` VARCHAR(30) NULL,
    `email` VARCHAR(200) NOT NULL,
    `address` TEXT NOT NULL,
    `accessHash` VARCHAR(80) NOT NULL,
    `accessExpiresAt` DATETIME(3) NOT NULL,
    `idempotencyKey` VARCHAR(80) NOT NULL,
    `requestHash` VARCHAR(80) NOT NULL,
    `subtotal` INTEGER NOT NULL,
    `discount` INTEGER NOT NULL,
    `shipping` INTEGER NOT NULL,
    `total` INTEGER NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'usd',
    `taxStatus` VARCHAR(24) NOT NULL DEFAULT 'not_calculated',
    `coupon` VARCHAR(40) NULL,
    `paymentStatus` VARCHAR(24) NOT NULL DEFAULT 'pending',
    `fulfillmentStatus` VARCHAR(24) NOT NULL DEFAULT 'unfulfilled',
    `paymentSession` VARCHAR(120) NULL,
    `paymentIntent` VARCHAR(120) NULL,
    `carrier` VARCHAR(60) NULL,
    `trackingNumber` VARCHAR(80) NULL,
    `refundReference` VARCHAR(120) NULL,
    `paidAt` DATETIME(3) NULL,
    `shippedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StoreOrder_number_key`(`number`),
    UNIQUE INDEX `StoreOrder_idempotencyKey_key`(`idempotencyKey`),
    UNIQUE INDEX `StoreOrder_paymentSession_key`(`paymentSession`),
    INDEX `StoreOrder_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `StoreOrder_paymentStatus_expiresAt_idx`(`paymentStatus`, `expiresAt`),
    INDEX `StoreOrder_email_createdAt_idx`(`email`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreOrderItem` (
    `id` VARCHAR(30) NOT NULL,
    `orderId` VARCHAR(30) NOT NULL,
    `variantId` VARCHAR(30) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `sku` VARCHAR(60) NOT NULL,
    `category` VARCHAR(40) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` INTEGER NOT NULL,

    INDEX `StoreOrderItem_orderId_idx`(`orderId`),
    INDEX `StoreOrderItem_variantId_idx`(`variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreCoupon` (
    `code` VARCHAR(40) NOT NULL,
    `percent` INTEGER NOT NULL,
    `minimum` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `expiresAt` DATETIME(3) NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreReturn` (
    `id` VARCHAR(30) NOT NULL,
    `orderId` VARCHAR(30) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'requested',
    `note` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StoreReturn_orderId_key`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreMail` (
    `id` VARCHAR(30) NOT NULL,
    `eventKey` VARCHAR(200) NOT NULL,
    `recipient` VARCHAR(200) NOT NULL,
    `subject` VARCHAR(200) NOT NULL,
    `text` TEXT NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StoreMail_eventKey_key`(`eventKey`),
    INDEX `StoreMail_status_nextAt_idx`(`status`, `nextAt`),
    INDEX `StoreMail_recipient_createdAt_idx`(`recipient`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(30) NOT NULL,
    `email` VARCHAR(200) NOT NULL,
    `password_hash` VARCHAR(200) NOT NULL,
    `full_name` VARCHAR(120) NULL,
    `is_admin` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(24) NOT NULL DEFAULT 'active',
    `locale` VARCHAR(12) NOT NULL DEFAULT 'en',
    `timezone` VARCHAR(40) NOT NULL DEFAULT 'UTC',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification_codes` (
    `id` VARCHAR(30) NOT NULL,
    `email` VARCHAR(200) NOT NULL,
    `channel` VARCHAR(24) NOT NULL DEFAULT 'email',
    `code_hash` VARCHAR(120) NOT NULL,
    `purpose` VARCHAR(40) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `verification_codes_email_purpose_idx`(`email`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_audit_logs` (
    `id` VARCHAR(30) NOT NULL,
    `admin_user_id` VARCHAR(30) NOT NULL,
    `action` VARCHAR(80) NOT NULL,
    `target_type` VARCHAR(60) NULL,
    `target_id` VARCHAR(80) NULL,
    `payload_before` TEXT NULL,
    `payload_after` TEXT NULL,
    `ip_address` VARCHAR(60) NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_audit_logs_admin_user_id_created_at_idx`(`admin_user_id`, `created_at`),
    INDEX `admin_audit_logs_target_type_target_id_idx`(`target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StoreVariant` ADD CONSTRAINT `StoreVariant_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `StoreProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreOrderItem` ADD CONSTRAINT `StoreOrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `StoreOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreOrderItem` ADD CONSTRAINT `StoreOrderItem_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `StoreVariant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreReturn` ADD CONSTRAINT `StoreReturn_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `StoreOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_audit_logs` ADD CONSTRAINT `admin_audit_logs_admin_user_id_fkey` FOREIGN KEY (`admin_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
