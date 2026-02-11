type ClassAttributeMatcher =
  {
    type: "regexp"
    classMatchRegex: RegExp;
    classPrefix?: string;
    splitChar?: string;
  } | {
    type: "jsx";
  };

export default ClassAttributeMatcher;
