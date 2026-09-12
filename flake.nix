{
  description = "Deno development environment for gitignore-patterns";

  inputs = {
    nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/0.1";
    vite-plus-overlay = {
      url = "github:ryoppippi/nix-vite-plus";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nixpkgs, vite-plus-overlay, ... }:
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
          overlays = [ vite-plus-overlay.overlays.default ];
        };
    in
    {
      devShells = forEachSystem (system: {
        default = (mkPkgs system).mkShell {
          packages = with (mkPkgs system); [
            deno
            git
            nodejs_24
            vite-plus
            nixfmt
          ];
        };
      });
    };
}
