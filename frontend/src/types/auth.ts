export type AuthConfig = {
  provider: "dev" | "oidc" | "local";
  registrationEnabled: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  isAdmin: boolean;
};
