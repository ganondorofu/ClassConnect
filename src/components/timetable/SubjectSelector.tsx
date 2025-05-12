
"use client";

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Subject } from '@/models/subject';

interface SubjectSelectorProps {
  subjects: Subject[];
  selectedSubjectId: string | null; // null now consistently means "科目未設定" (No Subject) is selected
  onValueChange: (subjectId: string | null) => void; // Passes subject ID or null for "科目未設定"
  placeholder?: string; 
  disabled?: boolean;
  className?: string;
}

export function SubjectSelector({
  subjects,
  selectedSubjectId,
  onValueChange,
  placeholder = "科目を選択", 
  disabled = false,
  className,
}: SubjectSelectorProps) {

  const handleValueChange = (value: string) => {
    // "none" value from the "科目未設定 (なし)" option translates to null
    onValueChange(value === "none" ? null : value);
  };
  
  // If selectedSubjectId is null, it means "科目未設定" is the active selection.
  // The <Select> component's value should then be "none".
  const selectValue = selectedSubjectId === null ? "none" : selectedSubjectId;

  return (
    <Select
      value={selectValue ?? "none"} 
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        {/* 
          The placeholder prop on SelectValue is displayed if the current `value` of the Select
          does not match any of the `value` props of its `SelectItem` children.
          When `selectedSubjectId` (and thus `selectValue`) is a valid subject ID or "none",
          the corresponding SelectItem's content will be shown.
          The placeholder text passed to this component is mainly for contexts where the parent
          wants to show a more descriptive "empty" state, e.g., "No change (Fixed: Math)".
        */}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {/* This is the explicit "No Subject" option */}
        <SelectItem value="none">
          <span className="text-muted-foreground">科目未設定 (なし)</span>
        </SelectItem>
        {subjects.map((subject) => (
          <SelectItem key={subject.id} value={subject.id!}>
            {subject.name} {subject.teacherName ? `(${subject.teacherName})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

