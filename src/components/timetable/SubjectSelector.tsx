
"use client";

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Subject } from '@/models/subject';

interface SubjectSelectorProps {
  subjects: Subject[];
  selectedSubjectId: string | null;
  onValueChange: (subjectId: string | null) => void;
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
    // If the "none" option is selected, pass null
    onValueChange(value === "none" ? null : value);
  };

  return (
    <Select
      value={selectedSubjectId ?? "none"} // Use "none" value for null/undefined
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="text-muted-foreground">{placeholder} (なし)</span>
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
