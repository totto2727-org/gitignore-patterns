{
  description = "Vite+ library development environment for gitignore-patterns";

  inputs = {
    nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/0.1";
  };

  outputs =
    { nixpkgs, ... }:
    let
      supportedSystems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forEachSystem = nixpkgs.lib.genAttrs supportedSystems;
      mkPkgs =
        system:
        import nixpkgs {
          inherit system;
        };
    in
    {
      devShells = forEachSystem (system: rec {
        ci = default.overrideAttrs (_: {
          shellHook = "";
        });
        default = (mkPkgs system).mkShell {
          packages = with (mkPkgs system); [
            git
            nixfmt
          ];
          shellHook = ''
            # Enable Git Hook
            vp config
          '';
        };
      });
    };
}
