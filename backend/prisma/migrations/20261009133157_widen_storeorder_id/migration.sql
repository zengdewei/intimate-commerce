/*
  Warnings:

  - The primary key for the `storeorder` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE `storeorderitem` DROP FOREIGN KEY `StoreOrderItem_orderId_fkey`;

-- DropForeignKey
ALTER TABLE `storereturn` DROP FOREIGN KEY `StoreReturn_orderId_fkey`;

-- AlterTable
ALTER TABLE `storeorder` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(36) NOT NULL,
    MODIFY `userId` VARCHAR(36) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `storeorderitem` MODIFY `orderId` VARCHAR(36) NOT NULL;

-- AlterTable
ALTER TABLE `storereturn` MODIFY `orderId` VARCHAR(36) NOT NULL;

-- AddForeignKey
ALTER TABLE `StoreOrderItem` ADD CONSTRAINT `StoreOrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `StoreOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreReturn` ADD CONSTRAINT `StoreReturn_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `StoreOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
