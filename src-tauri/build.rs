fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    // tauri-build's default app manifest is replaced by the one generated
    // below: it only declares the Common-Controls v6 dependency anyway, and
    // omitting it here avoids a duplicate MANIFEST resource once the same
    // manifest is embedded into test binaries (which tauri-build does not
    // cover on its own).
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("failed to run tauri-build");

    // `cargo test` builds test binaries without tauri-build's application
    // manifest. They import comctl32 v6 symbols (TaskDialogIndirect,
    // SetWindowSubclass), so without the Common-Controls dependency the loader
    // resolves comctl32 v5 and the process dies with STATUS_ENTRYPOINT_NOT_FOUND
    // (0xC0000139). Embed a minimal manifest into every target of this crate.
    #[cfg(windows)]
    {
        let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
            Ok("x86_64") => "amd64",
            Ok("aarch64") => "arm64",
            Ok("x86") => "x86",
            _ => "amd64",
        };
        let manifest =
            std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("app-manifest.xml");
        std::fs::write(
            &manifest,
            format!(
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="io.github.fahmiau.xlsformstudio" version="0.1.0.0" processorArchitecture="{arch}"/>
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/>
    </dependentAssembly>
  </dependency>
</assembly>
"#
            ),
        )
        .expect("failed to write test manifest");

        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
}
