import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createItem,
  deactivateItem,
  activateItem,
  deleteItem,
  completeItem,
  getAdminItem,
  getAdminItems,
  updateItem,
  customWishlistItemCreateInputSchema,
  customWishlistItemUpdateInputSchema,
} from "@/server/db/custom-wishlist";
import {
  createCheckPermissionMiddleware,
  protectedProcedure,
  router,
} from "@/server/trpc/trpc";
import { deleteFileStorageObject } from "@/server/utils/file-storage";

import { permissions } from "@/data/permissions";

import { notEmpty } from "@/utils/helpers";

const permittedProcedure = protectedProcedure.use(
  createCheckPermissionMiddleware(permissions.manageCustomWishlist),
);

export const adminCustomWishlistRouter = router({
  getItem: permittedProcedure
    .input(z.cuid())
    .query(({ input }) => getAdminItem(input)),

  deactivate: permittedProcedure
    .input(z.cuid())
    .mutation(async ({ ctx, input }) => await deactivateItem(ctx.res, input)),

  activate: permittedProcedure
    .input(z.cuid())
    .mutation(async ({ ctx, input }) => await activateItem(ctx.res, input)),

  complete: permittedProcedure
    .input(z.cuid())
    .mutation(async ({ ctx, input }) => await completeItem(ctx.res, input)),

  create: permittedProcedure
    .input(customWishlistItemCreateInputSchema)
    .mutation(async ({ ctx, input }) => await createItem(ctx.res, input)),

  update: permittedProcedure
    .input(customWishlistItemUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      await updateItem(ctx.res, input);
    }),

  delete: permittedProcedure
    .input(z.cuid())
    .mutation(async ({ ctx, input }) => {
      const post = await getAdminItem(input);
      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      await Promise.allSettled([
        deleteItem(ctx.res, post.id),
        // Delete all file attachments
        ...post.attachments
          .map(({ imageAttachment }) => imageAttachment?.fileStorageObject?.id)
          .filter(notEmpty)
          .map((id) => deleteFileStorageObject(id)),
      ]);
    }),

  getItems: permittedProcedure
    .input(
      z.object({
        filter: z
          .literal(["active", "completed", "inactive", "all"])
          .optional(),
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.cuid().nullish(),
      }),
    )
    .query(async ({ input }) => {
      const limit = input.limit ?? 20;
      const { cursor } = input;

      const items = await getAdminItems({
        take: limit + 1, // get an extra item at the end which we'll use as next cursor
        cursor: cursor || undefined,
        filter: input.filter,
      });

      let nextCursor: typeof cursor = undefined;
      if (items.length > limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id || undefined;
      }

      return { items, nextCursor };
    }),
});
