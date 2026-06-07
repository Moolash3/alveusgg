import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import Image from "next/image";
import { useRouter } from "next/router";
import {
  type ComponentProps,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { ImageAttachment, CustomWishlistItem } from "@alveusgg/database";

import type {
  CustomWishlistItemWithAttachments,
  CustomWishlistItemAttachments,
  CustomWishlistItemSubmitInput
} from "@/server/db/custom-wishlist";

import {
  MAX_IMAGES,
  MAX_VIDEOS,
  getMaxTextLengthForCreatedAt,
  resizeImageOptions,
} from "@/data/custom-wishlist";

import { classes } from "@/utils/classes";
import { type ImageMimeType, imageMimeTypes } from "@/utils/files";
import { createImageUrl } from "@/utils/image";
import { extractColorFromImage } from "@/utils/process-image";
import { trpc } from "@/utils/trpc";
import { parseVideoUrl } from "@/utils/video-urls";

import useFileUpload from "@/hooks/files/upload";
import { useFormChangeWarning } from "@/hooks/useFormChangeWarning";

import IconArrowDown from "@/icons/IconArrowDown";
import IconArrowUp from "@/icons/IconArrowUp";
import IconChevronDown from "@/icons/IconChevronDown";
import IconLoading from "@/icons/IconLoading";
import IconTrash from "@/icons/IconTrash";
import IconWarningTriangle from "@/icons/IconWarningTriangle";

import Link from "../../content/Link";
import { MessageBox } from "../../shared/MessageBox";
import { ModalDialog } from "../../shared/ModalDialog";
import { VideoPlatformIcon } from "../../shared/VideoPlatformIcon";
import { Button } from "../../shared/form/Button";
import { Fieldset } from "../../shared/form/Fieldset";
import { ImageUploadAttachment } from "../../shared/form/ImageUploadAttachment";
import { RichTextField } from "../../shared/form/RichTextField";
import { TextAreaField } from "../../shared/form/TextAreaField";
import { TextField } from "../../shared/form/TextField";
import {
  type FileAction,
  type FileReference,
  type SavedFileReference,
  UploadAttachmentsField,
  fileReducer,
} from "../../shared/form/UploadAttachmentsField";
import { VideoLinksField } from "../../shared/form/VideoLinksField";

type CustomWishlistItemFormProps = {
  className?: string;
  isAnonymous?: boolean;
  item?: CustomWishlistItemWithAttachments & Partial<CustomWishlistItem>;
  action: "review" | "create" | "update";
  onUpdate?: () => void;
  onUnsavedChangesRef?: (confirmFn: (message?: string) => boolean) => void;
};

type LocalAttachment =
  | { type: "image"; file: FileReference }
  | { type: "video"; url: string };

const makeSavedFileRef = (
  imageAttachment: ImageAttachment,
): SavedFileReference => ({
  status: "saved",
  id: imageAttachment.id,
  url: imageAttachment.url,
  fileStorageObjectId: imageAttachment.fileStorageObjectId,
  extractColor: () =>
    extractColorFromImage(
      createImageUrl({ src: imageAttachment.url, width: 1280, quality: 100 }),
    ),
});

function ImageAttachment({
  item,
  fileReference,
  onClick,
  children,
  disabled = false,
  ...props
}: Omit<ComponentProps<typeof ImageUploadAttachment>, "onClick"> &
  Pick<CustomWishlistItemFormProps, "item"> & {
    onClick: (url: string) => void;
  }) {
  const initialData =
    fileReference.status === "saved"
      ? item?.attachments.find(
          ({ imageAttachment }) =>
            imageAttachment && imageAttachment.id === fileReference.id,
        )?.imageAttachment
      : undefined;

  const [hasAlt, setHasAlt] = useState(!!initialData?.alternativeText);

  const handlePreviewClick = () => {
    if (
      fileReference.status === "upload.done" ||
      fileReference.status === "saved"
    ) {
      onClick(fileReference.url);
    }
  };

  return (
    <ImageUploadAttachment
      {...props}
      onClick={handlePreviewClick}
      fileReference={fileReference}
      disabled={disabled}
    >
      <TextAreaField
        name={`image[${fileReference.id}][caption]`}
        label={<strong className="font-bold">Caption</strong>}
        maxLength={200}
        defaultValue={initialData?.caption}
        isDisabled={disabled}
      />

      <Disclosure as="div" className="my-4" defaultOpen={hasAlt}>
        <DisclosureButton
          className={classes(
            "group flex w-full items-center justify-between text-left text-gray-500",
            hasAlt
              ? "pointer-events-none"
              : "transition-colors hover:text-gray-700",
          )}
          disabled={hasAlt}
        >
          <strong className="text-sm font-bold">
            Accessibility Description
          </strong>

          <IconChevronDown
            className="box-content shrink-0 p-1 transition-transform group-data-open:-scale-y-100"
            size={24}
          />
        </DisclosureButton>

        <DisclosurePanel className="rounded-sm bg-gray-100 p-2" static={hasAlt}>
          <TextAreaField
            name={`image[${fileReference.id}][alternativeText]`}
            label={
              <>
                <span className="sr-only">Alt text</span>
                <p className="text-xs text-gray-600 italic">
                  Use this text to describe the image for visually impaired
                  users. This text is NOT visible on the item page, but
                  will be read by screen readers and other accessibility tools.
                </p>
              </>
            }
            labelClassName="block -mb-4"
            maxLength={300}
            defaultValue={initialData?.alternativeText}
            onChange={(val) => setHasAlt(!!val)}
            isDisabled={disabled}
          />
        </DisclosurePanel>
      </Disclosure>

      {children}
    </ImageUploadAttachment>
  );
}

const mapSavedAttachments = (
  attachments: CustomWishlistItemAttachments,
): LocalAttachment[] =>
  attachments.map((att) => {
    if (att.attachmentType === "image" && att.imageAttachment) {
      return {
        type: "image",
        file: makeSavedFileRef(att.imageAttachment),
      };
    }

    if (att.attachmentType === "video" && att.linkAttachment) {
      return {
        type: "video",
        url: att.linkAttachment.url,
      };
    }

    throw new Error("Unknown attachment type");
  });

export function CustomWishlistItemForm({
  className,
  isAnonymous = false,
  action = "create",
  item,
  onUpdate,
  onUnsavedChangesRef,
}: CustomWishlistItemFormProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const create = trpc.adminCustomWishlist.create.useMutation();
  const update = trpc.adminCustomWishlist.update.useMutation();
  const isLoading = create.isPending || update.isPending;

  const { hasUnsavedChanges, markAsChanged, resetChanges, confirmIfUnsaved } =
    useFormChangeWarning();

  // Expose confirmIfUnsaved to parent component
  useEffect(() => {
    onUnsavedChangesRef?.(confirmIfUnsaved);
  }, [confirmIfUnsaved, onUnsavedChangesRef]);

  const closeModal = () => {
    setPreviewImageUrl(null);
  };

  const openModal = (url: string) => {
    setPreviewImageUrl(url);
  };

  const [attachments, setAttachments] = useState<LocalAttachment[]>(() =>
    item ? mapSavedAttachments(item.attachments) : [],
  );
  const swapAttachments = useCallback(
    (fromIdx: number, toIdx: number) => {
      setAttachments((prev) => {
        const fromAtt = prev[fromIdx];
        if (!fromAtt) return prev;

        const toAtt = prev[toIdx];
        if (!toAtt) return prev;

        const newAttachments = [...prev];
        newAttachments[fromIdx] = toAtt;
        newAttachments[toIdx] = fromAtt;

        markAsChanged();
        return newAttachments;
      });
    },
    [markAsChanged],
  );

  const imageDispatch = useCallback(
    (action: FileAction) => {
      setAttachments((prev) => {
        const prevFileRefs = prev
          .filter((att) => att.type === "image")
          .map((att) => att.file);
        const updatedImageFileRefs = fileReducer(prevFileRefs, action);

        markAsChanged();
        return prev
          .map((att) => {
            if (att.type === "image") {
              const updated = updatedImageFileRefs.find(
                (f) => f.id === att.file.id,
              );
              return updated ? { type: "image" as const, file: updated } : null;
            }

            return att;
          })
          .concat(
            updatedImageFileRefs
              .filter((f) => !prevFileRefs.find((p) => p.id === f.id))
              .map((f) => ({ type: "image" as const, file: f })),
          )
          .filter((att) => att !== null);
      });
    },
    [markAsChanged],
  );
  const imageAttachments = useMemo(
    () =>
      attachments.filter((att) => att.type === "image").map((att) => att.file),
    [attachments],
  );

  const videoDispatch = useCallback(
    (videoUrls: string[]) => {
      setAttachments((prev) => {
        const updatedVideoUrls = videoUrls.map((url) => ({
          type: "video" as const,
          url,
        }));

        markAsChanged();
        return prev
          .map((att) => {
            if (att.type === "video") {
              const updated = updatedVideoUrls.find((v) => v.url === att.url);
              return updated ?? null;
            }

            return att;
          })
          .concat(
            updatedVideoUrls.filter(
              (v) => !prev.find((p) => p.type === "video" && p.url === v.url),
            ),
          )
          .filter((att) => att !== null);
      });
    },
    [markAsChanged],
  );
  const videoAttachments = useMemo(
    () =>
      attachments.filter((att) => att.type === "video").map((att) => att.url),
    [attachments],
  );

  const createFileUpload = trpc.showAndTell.createFileUpload.useMutation();
  const upload = useFileUpload<ImageMimeType>(
    (signature) => createFileUpload.mutateAsync(signature),
    { allowedFileTypes: imageMimeTypes },
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isProcessing || isLoading) return;
    setIsProcessing(true);

    const formData = new FormData(e.currentTarget);

    const data: CustomWishlistItemSubmitInput = {
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      goal: formData.get("goal") as unknown as number,
      endsAt: formData.get("endsAt") as string || null,
      attachments: [],
    };

    for (const att of attachments) {
      // Non-image attachments don't need special handling
      if (att.type !== "image") {
        data.attachments.push(att);
        continue;
      }

      if (att.file.status !== "upload.done" && att.file.status !== "saved") {
        setError("Please wait for all uploads to finish");
        setIsProcessing(false);
        return;
      }

      const imageId = att.file.id;
      const imageObj = {
        type: "image" as const,
        title: "", // Currently not supported
        description: "", // Currently not supported
        caption: String(formData.get(`image[${imageId}][caption]`) || ""),
        alternativeText: String(
          formData.get(`image[${imageId}][alternativeText]`) || "",
        ),
      };

      if (att.file.status === "saved") {
        data.attachments.push({ ...imageObj, id: imageId });
      } else {
        data.attachments.push({
          ...imageObj,
          fileStorageObjectId: att.file.fileStorageObjectId,
          name: att.file.file.name,
        });
      }
    }

    if (action === "create") {
      create.mutate(data, {
        onSuccess: () => {
          resetChanges();
          if (isAnonymous) {
            // We can't redirect to the entry because the user is anonymous
            setIsSubmitted(true);
            onUpdate?.();
          } else {
            // Redirect to my posts
            router.push("/custom-wishlist/");
          }
        },
        onError: (err) => {
          setError(err.message);
          onUpdate?.();
        },
      });
    } else if (action === "update" && item) {
      update.mutate(
        { ...data, id: item.id },
        {
          onSuccess: (updatedItem) => {
            resetChanges();
            setSuccessMessage("Item updated successfully!");
            onUpdate?.();
            if (updatedItem) {
              setAttachments(mapSavedAttachments(updatedItem.attachments));
            }
          },
          onError: (err) => {
            setSuccessMessage(null);
            setError(err.message);
            onUpdate?.();
          },
        },
      );
    }

    setError(null);
    setIsProcessing(false);
  };

  if (isSubmitted) {
    return (
      <div className="my-5">
        <MessageBox variant="success">
          Your entry has been submitted. It will be reviewed by a moderator and
          then published.
        </MessageBox>
      </div>
    );
  }


  const isMutationPending = update.isPending;

  return (
    <form
      className={classes(
        "flex flex-col gap-5 rounded-xs",
        className,
        hasUnsavedChanges && "ring-4 ring-yellow",
      )}
      onSubmit={handleSubmit}
    >
      {action === "update" && (
        <MessageBox variant="warning" className="my-4 flex items-center gap-2">
          <IconWarningTriangle className="size-6 text-yellow-900" />
          You are modifying a previously approved post. Upon submitting your
          edits, the post will be unpublished until the changes have been
          reviewed and approved.
        </MessageBox>
      )}
      {error && <MessageBox variant="failure">{error}</MessageBox>}
      {successMessage && (
        <MessageBox variant="success">{successMessage}</MessageBox>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:gap-20">
        <div className="flex flex-3 flex-col gap-5">
          <Fieldset legend="Item">
            <TextField
              label="Title"
              isRequired
              minLength={1}
              maxLength={100}
              name="title"
              defaultValue={item?.title}
              placeholder="Name of the item or goal"
              onChange={markAsChanged}
            />
            <RichTextField
              label="Content"
              name="description"
              defaultValue={item?.description}
              maxLength={getMaxTextLengthForCreatedAt(item?.createdAt)}
              onChange={markAsChanged}
            />
          </Fieldset>
        </div>
        <div className="flex flex-2 flex-col gap-5">
          <Fieldset legend="Attachments">
            <VideoLinksField
              name="videoUrls"
              maxNumber={MAX_VIDEOS}
              value={videoAttachments}
              onChange={videoDispatch}
            />

            <UploadAttachmentsField
              files={imageAttachments}
              dispatch={imageDispatch}
              label="Pictures"
              upload={upload}
              maxNumber={MAX_IMAGES}
              allowedFileTypes={imageMimeTypes}
              resizeImageOptions={resizeImageOptions}
              disabled={isMutationPending}
            />

            <ul className="mt-4 flex flex-col gap-2 lg:mt-8">
              {attachments.map((att, idx) => {
                const buttons = (
                  <div className="flex justify-end gap-2">
                    <Button
                      size="small"
                      width="auto"
                      disabled={isMutationPending || idx === 0}
                      onClick={() => swapAttachments(idx, idx - 1)}
                    >
                      <IconArrowUp className="size-5" />
                      <span className="sr-only">Move Up</span>
                    </Button>
                    <Button
                      size="small"
                      width="auto"
                      disabled={
                        isMutationPending || idx === attachments.length - 1
                      }
                      onClick={() => swapAttachments(idx, idx + 1)}
                    >
                      <IconArrowDown className="size-5" />
                      <span className="sr-only">Move Down</span>
                    </Button>
                    <Button
                      size="small"
                      width="auto"
                      onClick={() =>
                        setAttachments((prev) => prev.filter((a) => a !== att))
                      }
                      disabled={isMutationPending}
                    >
                      <IconTrash className="size-5" />
                      Remove
                    </Button>
                  </div>
                );

                if (att.type === "image") {
                  return (
                    <li key={att.file.id}>
                      <ImageAttachment
                        item={item}
                        fileReference={att.file}
                        onClick={openModal}
                        disabled={isMutationPending}
                      >
                        {buttons}
                      </ImageAttachment>
                    </li>
                  );
                }

                if (att.type === "video") {
                  return (
                    <li
                      key={att.url}
                      className="flex flex-col gap-2 rounded-lg bg-white p-4 shadow-lg"
                    >
                      <Link
                        href={att.url}
                        external
                        className="group flex items-center"
                      >
                        <div className="relative mr-5 size-32 rounded-lg bg-gray-200 text-alveus-green-900 transition-transform group-hover:scale-105">
                          <VideoPlatformIcon
                            className="absolute top-1/2 left-1/2 size-12 -translate-1/2"
                            platform={parseVideoUrl(att.url)?.platform}
                          />
                        </div>

                        <span className="min-w-0 truncate text-left">
                          {att.url}
                        </span>
                      </Link>

                      {buttons}
                    </li>
                  );
                }

                return null;
              })}
            </ul>
          </Fieldset>
        </div>
      </div>

      <div className="space-y-10">
        {error && <MessageBox variant="failure">{error}</MessageBox>}
        {successMessage && (
          <MessageBox variant="success">{successMessage}</MessageBox>
        )}

        <Button type="submit" disabled={isProcessing || isLoading}>
          {isProcessing || isLoading ? (
            <>
              <IconLoading className="size-5" />
              Saving …
            </>
          ) : "Save changes"}
        </Button>
      </div>

      <ModalDialog
        isOpen={!!previewImageUrl}
        closeModal={closeModal}
        title="Image Preview"
        panelClassName="max-w-3xl"
      >
        {previewImageUrl && (
          <Image
            src={previewImageUrl}
            alt="Form Image"
            width={500}
            height={500}
            className="w-full object-contain"
          ></Image>
        )}
      </ModalDialog>
    </form>
  );
}
