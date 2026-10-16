# Contributing

Thanks for helping. Satin is in beta, so issues with a clear reproduction are as valuable as code.

## Report a problem

Open an issue with:

- the device, iOS version, and whether the app was installed to the Home Screen or open in a Safari tab;
- the smallest code that shows the problem;
- a screen recording, if the problem is about motion, touch or glass.

Check [Known issues](docs/known-issues.md) first: it may already be listed.

## Send a change

1. Read [the code style guide](docs/contributing/code-style.md). It describes how the framework is organised and the rules it keeps, for people and coding agents alike.
2. Run the checks before you open a pull request:

   ```sh
   pnpm install --frozen-lockfile
   pnpm -r typecheck
   pnpm -r lint
   pnpm build
   pnpm -r test
   ```

3. For a change people can see or feel, attach a recording from an app installed on a device or in the iOS Simulator, before and after. Desktop browsers and tests can't show how an installed app behaves.

Keep pull requests focused on one change. Documentation fixes are welcome on their own.

## Sign your work

Sign off every commit under the Developer Certificate of Origin 1.1 (below) with `git commit -s`, using your own name and email. A sign-off certifies the rights described in the certificate. Don't sign for someone else. No Contributor License Agreement is needed.

Contributions are licensed under the project's [MIT License](LICENSE). Third-party files keep their original terms: preserve their notices and say where they came from. Don't submit Apple artwork, font files, private SDK material or anything else you don't have the right to contribute.

## Developer Certificate of Origin 1.1

Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
