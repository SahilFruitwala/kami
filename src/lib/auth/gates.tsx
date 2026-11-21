import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton as ClerkUserButton,
} from "@clerk/tanstack-react-start";

/** Clerk account menu for the signed-in user. */
export function UserButton({ overlay }: { overlay?: boolean }) {
  return (
    <Show when="signed-in">
      <ClerkUserButton
        appearance={{
          elements: {
            avatarBox: overlay ? "size-full" : "size-8",
            userButtonBox: overlay ? "size-full" : undefined,
            userButtonTrigger: overlay ? "size-full opacity-0" : undefined,
          },
        }}
      />
    </Show>
  );
}

export { Show, SignInButton, SignUpButton };
