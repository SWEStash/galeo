// Electron fuses of every packaged binary (SR-08). One table serves packaging and the CI check
// that reads them back from the built binary.
export const FUSES = {
  RunAsNode: false,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  OnlyLoadAppFromAsar: true,
  EnableEmbeddedAsarIntegrityValidation: true,
  // The app never loads file: URLs (pages come from galeo://app).
  GrantFileProtocolExtraPrivileges: false,
};

