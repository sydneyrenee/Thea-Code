import React from "react";

interface VSCodeButtonProps {
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  appearance?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  "data-testid"?: string;
}

interface VSCodeCheckboxProps {
  children?: React.ReactNode;
  onChange?: (checked: boolean) => void;
  checked?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  "data-testid"?: string;
}

interface VSCodeTextFieldProps {
  children?: React.ReactNode;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInput?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  type?: string;
  "data-testid"?: string;
}

interface VSCodeLinkProps {
  children?: React.ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

interface VSCodeTextAreaProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  placeholder?: string;
  rows?: number;
  resize?: string;
  "data-testid"?: string;
}

interface VSCodeDropdownProps {
  children?: React.ReactNode;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

interface VSCodeOptionProps {
  children?: React.ReactNode;
  value?: string | number;
  checked?: boolean;
}

interface VSCodeRadioProps {
  children?: React.ReactNode;
  value?: string;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

interface VSCodeRadioGroupProps {
  children?: React.ReactNode;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

interface VSCodePanelsProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

interface VSCodePanelTabProps {
  children?: React.ReactNode;
  id: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

interface VSCodePanelViewProps {
  children?: React.ReactNode;
  id: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export const VSCodeButton: React.FC<VSCodeButtonProps> = ({ 
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

export const VSCodeCheckbox: React.FC<VSCodeCheckboxProps> = ({ 
  children, 
  onChange, 
  checked,
  disabled,
  className,
  style,
  title,
  ...props 
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e.target.checked);
    }
  };

  return (
    <label className={`vscode-checkbox ${className || ""}`} style={style} title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        {...props}
      />
      {children && <span>{children}</span>}
    </label>
  );
};

export const VSCodeTextField = React.forwardRef<HTMLInputElement, VSCodeTextFieldProps>(({ 
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

export const VSCodeLink: React.FC<VSCodeLinkProps> = ({ 
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

export const VSCodeTextArea: React.FC<VSCodeTextAreaProps> = ({ 
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

export const VSCodeDropdown: React.FC<VSCodeDropdownProps> = ({ 
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

export const VSCodeOption: React.FC<VSCodeOptionProps> = ({ 
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

export const VSCodeRadio: React.FC<VSCodeRadioProps> = ({ 
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

export const VSCodeRadioGroup: React.FC<VSCodeRadioGroupProps> = ({ 
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

export const VSCodePanels: React.FC<VSCodePanelsProps> = ({ 
  children, 
  className,
  style,
  title,
  ...props 
}) => {
  return (
    <div 
      className={`vscode-panels ${className || ""}`}
      style={style}
      title={title}
      {...props}
    >
      {children}
    </div>
  );
};

export const VSCodePanelTab: React.FC<VSCodePanelTabProps> = ({ 
  children, 
  id,
  className,
  style,
  title,
  ...props 
}) => {
  return (
    <div 
      id={id}
      className={`vscode-panel-tab ${className || ""}`}
      style={style}
      title={title}
      {...props}
    >
      {children}
    </div>
  );
};

export const VSCodePanelView: React.FC<VSCodePanelViewProps> = ({ 
  children, 
  id,
  className,
  style,
  title,
  ...props 
}) => {
  return (
    <div 
      id={id}
      className={`vscode-panel-view ${className || ""}`}
      style={style}
      title={title}
      {...props}
    >
      {children}
    </div>
  );
};
