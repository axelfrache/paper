export type AuthConfig = {
  provider: "dev" | "oidc";
  registrationEnabled: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  isAdmin: boolean;
};
