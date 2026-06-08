import type {
  GetServerSidePropsContext,
  InferGetStaticPropsType,
  NextPage,
} from "next";
import { getSession } from "next-auth/react";

import { getAdminSSP } from "@/server/utils/admin";

import { permissions } from "@/data/permissions";

import { trpc } from "@/utils/trpc";

import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { Headline } from "@/components/admin/Headline";
import { Panel } from "@/components/admin/Panel";
import { CustomWishlistItemForm } from "@/components/admin/custom-wishlist/AdminCustomWishlistItemForm";
import Meta from "@/components/content/Meta";
import { MessageBox } from "@/components/shared/MessageBox";

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const session = await getSession(context);
  const adminProps = await getAdminSSP(context, permissions.manageDonations);
  if (!adminProps) {
    return {
      redirect: {
        destination: session?.user?.id
          ? "/unauthorized"
          : `/auth/signin?callbackUrl=${encodeURIComponent(context.resolvedUrl)}`,
        permanent: false,
      },
    };
  }

  const id = context.params?.itemId;
  if (!id) {
    return { notFound: true };
  }

  return {
    props: {
      ...adminProps,
      itemId: String(id),
    },
  };
}

const AdminEditFormPage: NextPage<
  InferGetStaticPropsType<typeof getServerSideProps>
> = ({ menuItems, itemId }) => {
  const item = trpc.adminCustomWishlist.getItem.useQuery(itemId);

  return (
    <>
      <Meta title="Edit Custom Wishlist Item | Admin" />

      <AdminPageLayout title="Edit Custom Wishlist Item" menuItems={menuItems}>
        <Headline>Edit custom wishlist item</Headline>

        <Panel>
          {item.data ? (
            <CustomWishlistItemForm action="update" item={item.data} />
          ) : (
            <MessageBox>Loading …</MessageBox>
          )}
        </Panel>
      </AdminPageLayout>
    </>
  );
};
export default AdminEditFormPage;
