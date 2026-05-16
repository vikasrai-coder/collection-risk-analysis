import React, { useRef, useEffect, useState } from 'react';
import { 
  Bold, Italic, Underline, List, ListOrdered, 
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon,
  Type, ChevronDown, User, Building2, UserSquare2, Calendar
} from 'lucide-react';
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  variables?: { label: string; value: string; icon: any }[];
}

export function RichTextEditor({ 
  value, 
  onChange, 
  placeholder, 
  className,
  variables = [
    { label: 'First Name', value: '{{name}}', icon: User },
    { label: 'Company', value: '{{company}}', icon: Building2 },
    { label: 'Owner', value: '{{owner}}', icon: UserSquare2 },
    { label: 'Current Date', value: '{{date}}', icon: Calendar },
  ]
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const insertVariable = (variable: string) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, variable);
    handleInput();
  };

  return (
    <div className={cn(
      "flex flex-col rounded-xl border border-border bg-card overflow-hidden transition-all",
      isFocused && "ring-2 ring-primary/20 border-primary",
      className
    )}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30">
        <div className="flex items-center border-r border-border pr-1.5 mr-1.5">
          <ToolbarButton icon={Bold} onClick={() => execCommand('bold')} title="Bold" />
          <ToolbarButton icon={Italic} onClick={() => execCommand('italic')} title="Italic" />
          <ToolbarButton icon={Underline} onClick={() => execCommand('underline')} title="Underline" />
        </div>

        <div className="flex items-center border-r border-border pr-1.5 mr-1.5">
          <ToolbarButton icon={List} onClick={() => execCommand('insertUnorderedList')} title="Bullet List" />
          <ToolbarButton icon={ListOrdered} onClick={() => execCommand('insertOrderedList')} title="Numbered List" />
        </div>

        <div className="flex items-center border-r border-border pr-1.5 mr-1.5">
          <ToolbarButton icon={AlignLeft} onClick={() => execCommand('justifyLeft')} title="Align Left" />
          <ToolbarButton icon={AlignCenter} onClick={() => execCommand('justifyCenter')} title="Align Center" />
          <ToolbarButton icon={AlignRight} onClick={() => execCommand('justifyRight')} title="Align Right" />
        </div>

        <ToolbarButton icon={LinkIcon} onClick={() => {
          const url = prompt('Enter URL:');
          if (url) execCommand('createLink', url);
        }} title="Link" />

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-[10px] font-bold gap-1.5 hover:bg-primary/10 hover:text-primary">
                <Type className="h-3.5 w-3.5" />
                VARIABLES
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {variables.map((v) => (
                <DropdownMenuItem 
                  key={v.value} 
                  onClick={() => insertVariable(v.value)}
                  className="gap-2 cursor-pointer"
                >
                  <v.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs">{v.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1 rounded">{v.value}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Editable Area */}
      <div 
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="min-h-[150px] p-4 text-sm focus:outline-none overflow-y-auto prose prose-sm max-w-none text-foreground"
        placeholder={placeholder}
      />
      
      {/* CSS to handle placeholder since contenteditable doesn't support it natively */}
      <style>{`
        [contenteditable]:empty:before {
          content: attr(placeholder);
          color: #94a3b8;
          cursor: text;
        }
      `}</style>
    </div>
  );
}

function ToolbarButton({ icon: Icon, onClick, title }: { icon: any, onClick: () => void, title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
