//! pmx — CLI front-end for the picomatch port. `pmx --serve` is the JSONL
//! subprocess adapter (constitution §4b), delegating every op to
//! `pmx_cli::dispatch` so the napi transport (crates/pmx-node) answers
//! identically.
#![forbid(unsafe_code)]

use pmx_cli::dispatch::{dispatch_str, VERSION};
use std::io::{BufRead, Write};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--version" || a == "-v") {
        println!("pmx {VERSION}");
        return;
    }
    if !args.iter().any(|a| a == "--serve") {
        eprintln!("usage: pmx --serve | pmx --version");
        std::process::exit(2);
    }

    if std::env::var_os("PMX_QUIET").is_none() {
        eprintln!("pmx {VERSION} --serve: reading JSONL ops on stdin");
    }

    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut out = std::io::BufWriter::new(stdout.lock());

    for line in stdin.lock().lines() {
        let Ok(line) = line else { continue };
        let _ = writeln!(out, "{}", dispatch_str(&line));
        let _ = out.flush();
    }
}
