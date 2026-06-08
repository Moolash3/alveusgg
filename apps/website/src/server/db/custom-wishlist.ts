import { TRPCError } from "@trpc/server";
import type { NextApiResponse } from "next";
import { z } from "zod";

import {
  type FileStorageObject,
  type ImageAttachment,
  type ImageMetadata,
  type LinkAttachment,
  type CustomWishlistItem$attachmentsArgs,
  type CustomWishlistItemAttachment,
  type CustomWishlistItemAttachmentCreateWithoutItemInput,
  type CustomWishlistItem as CustomWishlistItemModel,
  prisma,
} from "@alveusgg/database";

import { checkAndFixUploadedImageFileStorageObject } from "@/server/utils/file-storage";
import { sanitizeUserHtml } from "@/server/utils/sanitize-user-html";

import {
  MAX_IMAGES,
  MAX_DESCRIPTION_HTML_LENGTH,
  MAX_VIDEOS,
} from "@/data/custom-wishlist";

import { notEmpty } from "@/utils/helpers";
import { parseVideoUrl, validateNormalizedVideoUrl } from "@/utils/video-urls";

export type ImageAttachmentWithFileStorageObject = ImageAttachment & {
  fileStorageObject:
    | (FileStorageObject & { imageMetadata: ImageMetadata | null })
    | null;
};

export type FullCustomWishlistItemAttachment = CustomWishlistItemAttachment & {
  linkAttachment: LinkAttachment | null;
  imageAttachment: ImageAttachmentWithFileStorageObject | null;
};

export type CustomWishlistItemAttachments =
  Array<FullCustomWishlistItemAttachment>;

export type CustomWishlistItemWithAttachments = CustomWishlistItemModel & {
  attachments: CustomWishlistItemAttachments;
};

const PublicCustomWishlistItemFields = [
  "id",
  "title",
  "description",
  "endsAt",
  "goal",
] as const satisfies (keyof CustomWishlistItemModel)[];

export type PublicCustomWishlistItem = Pick<
  CustomWishlistItemModel,
  (typeof PublicCustomWishlistItemFields)[number]
>;

export type PublicCustomWishlistItemWithAttachments =
  PublicCustomWishlistItem & {
    attachments: CustomWishlistItemAttachments;
  };

const withAttachments = {
  include: {
    attachments: {
      include: {
        linkAttachment: true,
        imageAttachment: {
          include: { fileStorageObject: { include: { imageMetadata: true } } },
        },
      },
      orderBy: [{ order: "asc" }, { attachmentType: "desc" }, { id: "asc" }],
    },
  },
} as const satisfies {
  include: { attachments: CustomWishlistItem$attachmentsArgs };
};

const selectPublic = PublicCustomWishlistItemFields.reduce(
  (acc, field) => ({ ...acc, [field]: true }),
  {} as { [K in (typeof PublicCustomWishlistItemFields)[number]]: true },
);

const whereActivated = {
  activatedAt: { gte: prisma.customWishlistItem.fields.updatedAt },
};

function getItemFilter(
  filter: "inactive" | "active" | "completed" | "finalized",
) {
  if (filter == "finalized") return { seenOnStream: true };
  if (filter == "inactive") return { activatedAt: null };
  if (filter == "active")
    return { activatedAt: { gte: prisma.customWishlistItem.fields.updatedAt } };
  if (filter == "completed")
    return { completedAt: { gte: prisma.customWishlistItem.fields.updatedAt } };
}

const itemOrderBy = [{ endsAt: "asc" }, { updatedAt: "desc" }] as const;

const imageBaseSchema = z.object({
  type: z.literal("image"),
  title: z.string().max(100),
  caption: z.string().max(200),
  description: z.string().max(200),
  alternativeText: z.string().max(300),
});

const imageNewSchema = imageBaseSchema.extend({
  fileStorageObjectId: z.cuid(),
  name: z.string(),
});

const imageExistingSchema = imageBaseSchema.extend({
  id: z.cuid(),
});

const videoSchema = z.object({
  type: z.literal("video"),
  url: z.url().refine(validateNormalizedVideoUrl),
});

const attachmentSchema = z.union([
  imageNewSchema,
  imageExistingSchema,
  videoSchema,
]);

const attachmentsSchema = z
  .array(attachmentSchema)
  .refine(
    (list) => list.filter((a) => a.type === "image").length <= MAX_IMAGES,
    {
      message: `Too many image attachments. Max ${MAX_IMAGES}.`,
    },
  )
  .refine(
    (list) => list.filter((a) => a.type === "video").length <= MAX_VIDEOS,
    {
      message: `Too many video attachments. Max ${MAX_VIDEOS}.`,
    },
  );

export type CustomWishlistItemSubmitInput = z.infer<
  typeof customWishlistItemSharedInputSchema
>;
const customWishlistItemSharedInputSchema = z.object({
  title: z.string().max(100),
  description: z.string().max(MAX_DESCRIPTION_HTML_LENGTH),
  attachments: attachmentsSchema,
  endsAt: z.iso.datetime().nullable(),
  goal: z.number().min(1).max(50000000),
});

export const customWishlistItemCreateInputSchema =
  customWishlistItemSharedInputSchema;

export const customWishlistItemUpdateInputSchema =
  customWishlistItemSharedInputSchema.and(
    z.object({
      id: z.cuid2(),
    }),
  );

export type CustomWishlistItemUpdateInput = z.infer<
  typeof customWishlistItemUpdateInputSchema
>;

const revalidateCache = (res: NextApiResponse) => {
  res.revalidate("/custom-wishlist");
};

function createVideoAttachment({
  type: _,
  ...attachment
}: z.infer<typeof videoSchema>) {
  return {
    attachmentType: "video",
    linkAttachment: {
      create: {
        type: parseVideoUrl(attachment.url)?.platform || "video",
        url: attachment.url,
        title: "Video",
        name: "Video",
        caption: "",
        alternativeText: "",
        description: "",
      },
    },
  } as const satisfies CustomWishlistItemAttachmentCreateWithoutItemInput;
}

async function createOrUpdateImageAttachment({
  type: _,
  ...attachment
}: z.infer<typeof imageNewSchema> | z.infer<typeof imageExistingSchema>) {
  if ("id" in attachment) {
    const { id, ...attachmentData } = attachment;

    await prisma.imageAttachment.update({
      where: { id },
      data: attachmentData,
    });

    return {
      attachmentType: "image",
      imageAttachment: { connect: { id } },
    } as const satisfies CustomWishlistItemAttachmentCreateWithoutItemInput;
  }

  const { error, metaData } = await checkAndFixUploadedImageFileStorageObject(
    attachment.fileStorageObjectId,
  );

  if (error || !metaData) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Error uploading file: ${error}`,
    });
  }

  const imageAttachment = await prisma.imageAttachment.create({
    data: {
      ...attachment,
      url: metaData.url,
    },
  });

  return {
    attachmentType: "image",
    imageAttachment: { connect: { id: imageAttachment.id } },
  } as const satisfies CustomWishlistItemAttachmentCreateWithoutItemInput;
}

export async function createItem(
  res: NextApiResponse,
  input: CustomWishlistItemSubmitInput,
) {
  const description = sanitizeUserHtml(input.description);

  const processedAttachments = await Promise.all(
    input.attachments.map((attachment) => {
      if (attachment.type === "image") {
        if ("id" in attachment) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Existing image attachments cannot be used when creating a post.",
          });
        }

        return createOrUpdateImageAttachment(attachment);
      }

      if (attachment.type === "video") {
        return createVideoAttachment(attachment);
      }

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Unknown attachment type",
      });
    }),
  ).then((results) => results.map((res, idx) => ({ ...res, order: idx })));

  const result = await prisma.customWishlistItem.create({
    data: {
      title: input.title,
      description,
      attachments: { create: processedAttachments },
      endsAt: input.endsAt,
      goal: input.goal,
    },
  });
  revalidateCache(res);
  return result;
}

export async function getPublicItemById(id: string) {
  return prisma.customWishlistItem.findFirst({
    select: {
      ...selectPublic,
      attachments: withAttachments.include.attachments,
    },
    where: {
      ...whereActivated,
      id,
    },
  });
}

export async function getPublicItems({
  take,
  cursor,
}: {
  take?: number;
  cursor?: string;
} = {}) {
  return prisma.customWishlistItem.findMany({
    where: getItemFilter("active"),
    select: {
      ...selectPublic,
      attachments: withAttachments.include.attachments,
    },
    orderBy: [...itemOrderBy],
    cursor: cursor ? { id: cursor } : undefined,
    take,
  });
}

export async function getAdminItems({
  take,
  cursor,
  filter = "active",
}: {
  take?: number;
  cursor?: string;
  filter?: "inactive" | "active" | "completed" | "finalized";
} = {}) {
  return prisma.customWishlistItem.findMany({
    where: getItemFilter(filter),
    orderBy: [...itemOrderBy],
    cursor: cursor ? { id: cursor } : undefined,
    take,
  });
}

export async function getAdminItem(id: string) {
  return prisma.customWishlistItem.findFirst({
    include: {
      ...withAttachments.include,
    },
    where: {
      id,
    },
  });
}

export async function updateItem(
  res: NextApiResponse,
  input: CustomWishlistItemUpdateInput,
) {
  const existingItem = await prisma.customWishlistItem.findFirstOrThrow({
    where: {
      id: input.id,
    },
    include: { attachments: true },
  });
  const existingItemImageAttachmentIds = new Set(
    existingItem.attachments
      .map((att) => att.imageAttachmentId)
      .filter((id) => id !== null),
  );

  // Check that the only existing image attachments that are connected to the item are updated
  const processedAttachments = await Promise.all(
    input.attachments.map((attachment) => {
      if (attachment.type === "image") {
        if ("id" in attachment) {
          if (!existingItemImageAttachmentIds.has(attachment.id)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Tried to update attachment that is not connected to the item.",
            });
          }
        }

        return createOrUpdateImageAttachment(attachment);
      }

      if (attachment.type === "video") {
        return createVideoAttachment(attachment);
      }

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Unknown attachment type",
      });
    }),
  ).then((results) => results.map((res, idx) => ({ ...res, order: idx })));

  const description = sanitizeUserHtml(input.description);

  const now = new Date();

  await prisma.customWishlistItem.update({
    where: {
      id: input.id,
    },
    data: {
      title: input.title,
      description,
      updatedAt: now,
      endsAt: input.endsAt || existingItem.endsAt,
      attachments: {
        deleteMany: {
          OR: [
            // Delete all video attachments (we add them back later if they are still in the input)
            { attachmentType: { not: "image" } },
            // Delete image attachments that are no longer in the update list
            {
              attachmentType: "image",
              imageAttachmentId: {
                notIn: processedAttachments
                  .filter((att) => att.attachmentType === "image")
                  .map((att) => att.imageAttachment.connect.id),
              },
            },
          ],
        },
        // Create any new attachments (all videos and new images)
        create: processedAttachments.filter(
          (att) =>
            att.attachmentType !== "image" ||
            !existingItemImageAttachmentIds.has(att.imageAttachment.connect.id),
        ),
        // Ensure existing images have the correct order applied
        updateMany: processedAttachments
          .filter((att) => att.attachmentType === "image")
          .filter((att) =>
            existingItemImageAttachmentIds.has(att.imageAttachment.connect.id),
          )
          .map((att) => ({
            where: { imageAttachmentId: att.imageAttachment.connect.id },
            data: { order: att.order },
          })),
      },
    },
  });
  revalidateCache(res);
}

export async function finalizeItem(res: NextApiResponse, id: string) {
  await prisma.customWishlistItem.updateMany({
    where: { id },
    data: {
      seeOnStream: true,
      seeOnStreamAt: new Date(),
    },
  });
  revalidateCache(res);
}

export async function deactivateItem(res: NextApiResponse, id: string) {
  await prisma.customWishlistItem.updateMany({
    where: { id },
    data: {
      activatedAt: null,
    },
  });
  revalidateCache(res);
}

export async function activateItem(res: NextApiResponse, id: string) {
  await prisma.customWishlistItem.updateMany({
    where: { id },
    data: {
      activatedAt: new Date(),
    },
  });
  revalidateCache(res);
}

export async function completeItem(res: NextApiResponse, id: string) {
  await prisma.customWishlistItem.updateMany({
    where: { id },
    data: {
      completedAt: new Date(),
    },
  });
  revalidateCache(res);
}

export async function deleteItem(res: NextApiResponse, id: string) {
  const item = await getAdminItem(id);
  if (!item) return false;
  const donationCount = await prisma.donation.count({
    where: {
      customWishlistItemId: item.id,
    },
  });

  if (donationCount > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot delete items with donations",
    });
  }

  await Promise.allSettled([
    prisma.customWishlistItem.delete({ where: { id: item.id } }),
    prisma.imageAttachment.deleteMany({
      where: {
        id: {
          in: item.attachments.map((a) => a.imageAttachmentId).filter(notEmpty),
        },
      },
    }),
    prisma.linkAttachment.deleteMany({
      where: {
        id: {
          in: item.attachments.map((a) => a.linkAttachmentId).filter(notEmpty),
        },
      },
    }),
  ]);
  revalidateCache(res);
}
