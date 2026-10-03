import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton as ClerkUserButton,
} from "@clerk/tanstack-react-start";

/** Clerk account menu for the signed-in user. */
export function UserButton() {
  return (
    <Show when="signed-in">
      <ClerkUserButton
        appearance={{
          elements: {
            avatarBox: "size-8",
          },
        }}
      />
    </Show>
  );
}

export { Show, SignInButton, SignUpButton };
