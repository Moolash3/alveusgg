import type { inferRouterOutputs } from "@trpc/server";
import { Fragment, useCallback, useState } from "react";

import type { AppRouter } from "@/server/trpc/router/_app";

import { trpc } from "@/utils/trpc";

import { Button } from "@/components/shared/form/Button";
import Select from "@/components/content/Select";

import IconLoading from "@/icons/IconLoading";

import { Panel } from "../Panel";
import { AdminCustomWishlistItem } from "./AdminCustomWishlistItem";

type RouterOutput = inferRouterOutputs<AppRouter>;
type Item = RouterOutput["adminCustomWishlist"]["getItems"]["items"][number];

const statusOptions = {
  all: "All",
  inactive: "Inactive",
  active: "Active",
  completed: "Completed",
  finalized: "Finalized",
};

export function AdminCustomWishlistItemsPanel() {
  const [filter, setFilter] = useState<
    "all" | "inactive" | "active" | "completed" | "finalized"
  >("all");
  const items = trpc.adminCustomWishlist.getItems.useInfiniteQuery(
    { filter },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const finalizeItem = trpc.adminCustomWishlist.finalize.useMutation({
    onSettled: async () => {
      await items.refetch();
    },
  });
  const handleFinalizeItem = useCallback(
    (item: Item) => {
      finalizeItem.mutate(item.id);
    },
    [finalizeItem],
  );

  const deactivateItem = trpc.adminCustomWishlist.deactivate.useMutation({
    onSettled: async () => {
      await items.refetch();
    },
  });
  const handleDeactivateItem = useCallback(
    (item: Item) => {
      deactivateItem.mutate(item.id);
    },
    [deactivateItem],
  );

  const activateItem = trpc.adminCustomWishlist.activate.useMutation({
    onSettled: async () => {
      await items.refetch();
    },
  });
  const handleActivateItem = useCallback(
    (item: Item) => {
      activateItem.mutate(item.id);
    },
    [activateItem],
  );

  const completeItem = trpc.adminCustomWishlist.complete.useMutation({
    onSettled: async () => {
      await items.refetch();
    },
  });
  const handleCompleteItem = useCallback(
    (item: Item) => {
      completeItem.mutate(item.id);
    },
    [completeItem],
  );

  const deleteItem = trpc.adminCustomWishlist.delete.useMutation({
    onSettled: async () => {
      await items.refetch();
    },
  });
  const handleDeleteItem = useCallback(
    (item: Item) => {
      deleteItem.mutate(item.id);
    },
    [deleteItem],
  );

  const canLoadMore = items.hasNextPage && !items.isFetchingNextPage;

  return (
    <>
      <Select
        options={statusOptions}
        value={filter}
        onChange={(value) => setFilter(value)}
        label={<span className="sr-only">Status</span>}
        align="right"
        className="shrink-0"
      />
      <Panel>
        {items.isPending && <p>Loading …</p>}
        {items.status === "error" && <p>Error fetching items!</p>}
        {items.data?.pages && items.data.pages.length > 0 && (
          <>
            <table className="w-full">
              <thead>
                <tr>
                  <th scope="col" className="w-3/5 text-left">
                    Title
                  </th>
                  <th scope="col" className="text-left">
                    Status
                  </th>
                  <th scope="col" className="text-left">
                    Goal
                  </th>
                  <th scope="col" className="text-left">
                    Created/Updated
                  </th>
                  <th scope="col" className="text-left">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.data?.pages.map((page) => (
                  <Fragment key={page.nextCursor || "default"}>
                    {page.items.map((item: Item) => (
                      <AdminCustomWishlistItem
                        key={item.id}
                        item={item}
                        finalizeItem={handleFinalizeItem}
                        deactivateItem={handleDeactivateItem}
                        activateItem={handleActivateItem}
                        completeItem={handleCompleteItem}
                        deleteItem={handleDeleteItem}
                      />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>

            <div className="mt-5">
              {canLoadMore ? (
                <Button onClick={() => items.fetchNextPage()}>
                  {items.isFetchingNextPage ? (
                    <>
                      <IconLoading size={20} /> Loading…
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              ) : (
                <p className="p-2 text-center italic">
                  {items.isFetchingNextPage ? "Loading more …" : "- End -"}
                </p>
              )}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
