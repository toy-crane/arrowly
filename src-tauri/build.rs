fn main() {
    tauri_build::build();

    // screencapturekit's Swift bridge needs the concurrency runtime when the
    // deployment target predates the host SDK. Dependency link args do not
    // propagate to this final Tauri binary/test target, so add its rpaths here.
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        if let Ok(output) = std::process::Command::new("xcode-select")
            .arg("-p")
            .output()
        {
            if output.status.success() {
                let developer_dir = String::from_utf8_lossy(&output.stdout);
                let developer_dir = developer_dir.trim();
                println!(
                    "cargo:rustc-link-arg=-Wl,-rpath,{developer_dir}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-5.5/macosx"
                );
                println!(
                    "cargo:rustc-link-arg=-Wl,-rpath,{developer_dir}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx"
                );
            }
        }
    }
}
