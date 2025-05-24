import React from "react";

interface VSCodeComponentProps {
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onInput?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  appearance?: string;
  checked?: boolean;
  value?: string | number;
  placeholder?: string;
  href?: string;
  "data-testid"?: string;
  style?: React.CSSProperties;
  slot?: string;
  role?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export const VSCodeButton: React.FC<VSCodeComponentProps> = ({ 
  children, 
  onClick, 
  appearance, 
  disabled,
  className,
  style,
  title,
  ...props 
}) => {
  const buttonClassName = `vscode-button ${appearance === "primary" ? "primary" : appearance === "secondary" ? "secondary" : ""} ${className || ""}`;

  return (
    <button
      className={buttonClassName}
      onClick={onClick}
      disabled={disabled}
      style={style}
      title={title}
      {...props}
    >
      {children}
    </button>
  );
};

export const VSCodeCheckbox: React.FC<VSCodeComponentProps> = ({ 
  children, 
  onChange, 
  checked,
  disabled,
  className,
  style,
  title,
  ...props 
}) => {
  return (
    <label className={`vscode-checkbox ${className || ""}`} style={style} title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        {...props}
      />
      {children && <span>{children}</span>}
    </label>
  );
};

export const VSCodeTextField = React.forwardRef<HTMLInputElement, VSCodeComponentProps>(({ 
  children, 
  value, 
  onInput, 
  placeholder,
  disabled,
  className,
  style,
  title,
  ...props 
}, ref) => {
  return (
    <div className={`vscode-textfield ${className || ""}`} style={{ position: "relative", display: "inline-block", width: "100%", ...style }}>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={onInput}
        placeholder={placeholder}
        disabled={disabled}
        title={title}
        {...props}
      />
      {children}
    </div>
  );
});

export const VSCodeLink: React.FC<VSCodeComponentProps> = ({ 
  children, 
  href,
  className,
  style,
  title,
  onClick,
  ...props 
}) => {
  return (
    <a 
      href={href || "#"} 
      className={`vscode-link ${className || ""}`}
      style={style}
      title={title}
      onClick={onClick}
      {...props}
    >
      {children}
    </a>
  );
};

export const VSCodeTextArea: React.FC<VSCodeComponentProps> = ({ 
  value, 
  onChange,
  disabled,
  className,
  style,
  title,
  placeholder,
  ...props 
}) => {
  return (
    <textarea
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`vscode-textarea ${className || ""}`}
      style={style}
      title={title}
      placeholder={placeholder}
      {...props}
    />
  );
};

export const VSCodeDropdown: React.FC<VSCodeComponentProps> = ({ 
  children, 
  value, 
  onChange,
  disabled,
  className,
  style,
  title,
  ...props 
}) => {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`vscode-dropdown ${className || ""}`}
      style={style}
      title={title}
      {...props}
    >
      {children}
    </select>
  );
};

export const VSCodeOption: React.FC<VSCodeComponentProps> = ({ 
  children, 
  value,
  ...props 
}) => {
  return (
    <option value={value} {...props}>
      {children}
    </option>
  );
};

export const VSCodeRadio: React.FC<VSCodeComponentProps> = ({ 
  children, 
  value, 
  checked, 
  onChange,
  disabled,
  className,
  style,
  title,
  ...props 
}) => {
  return (
    <label className={`vscode-radio ${className || ""}`} style={{ display: "inline-flex", alignItems: "center", ...style }} title={title}>
      <input
        type="radio"
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        {...props}
      />
      {children && <span style={{ marginLeft: "4px" }}>{children}</span>}
    </label>
  );
};

export const VSCodeRadioGroup: React.FC<VSCodeComponentProps> = ({ 
  children, 
  onChange,
  className,
  style,
  title,
  ...props 
}) => {
  return (
    <div 
      role="radiogroup" 
      onChange={onChange} 
      className={`vscode-radiogroup ${className || ""}`}
      style={style}
      title={title}
      {...props}
    >
      {children}
    </div>
  );
};
