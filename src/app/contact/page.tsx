
"use client";

import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { InquiryType, inquiryTypeLabels } from '@/models/inquiry';
import { addInquiry } from '@/controllers/inquiryController';
import { AlertCircle, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const inquirySchema = z.object({
  type: z.nativeEnum(InquiryType, { required_error: "種別を選択してください。" }),
  content: z.string().min(10, { message: "お問い合わせ内容は10文字以上で入力してください。" }).max(2000, { message: "お問い合わせ内容は2000文字以内で入力してください。" }),
  email: z.string().email({ message: "有効なメールアドレスを入力してください。" }).optional().or(z.literal('')),
});

type InquiryFormData = z.infer<typeof inquirySchema>;

export default function ContactPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<InquiryFormData>({
    resolver: zodResolver(inquirySchema),
    defaultValues: {
      type: undefined,
      content: '',
      email: '',
    },
  });

  const onSubmit = async (data: InquiryFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await addInquiry({
        type: data.type,
        content: data.content,
        email: data.email || null,
      });
      toast({
        title: "お問い合わせ送信完了",
        description: "お問い合わせありがとうございます。内容を確認し、必要に応じてご連絡いたします。",
      });
      reset();
    } catch (error) {
      console.error("Inquiry submission error:", error);
      setSubmitError(error instanceof Error ? error.message : "お問い合わせの送信中にエラーが発生しました。");
      toast({
        title: "送信エラー",
        description: error instanceof Error ? error.message : "お問い合わせの送信に失敗しました。しばらくしてから再度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto py-8 px-4 md:px-0 max-w-2xl">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">お問い合わせ</CardTitle>
            <CardDescription className="text-center">
              ClassConnectに関するご意見、ご要望、不具合報告などはこちらからお送りください。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>送信エラー</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <Label htmlFor="type">お問い合わせ種別 <span className="text-destructive">*</span></Label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
                      <SelectTrigger id="type" className={errors.type ? "border-destructive" : ""}>
                        <SelectValue placeholder="種別を選択してください" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(InquiryType).map((type) => (
                          <SelectItem key={type} value={type}>
                            {inquiryTypeLabels[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.type && <p className="text-xs text-destructive mt-1">{errors.type.message}</p>}
              </div>

              <div>
                <Label htmlFor="content">お問い合わせ内容 <span className="text-destructive">*</span></Label>
                <Textarea
                  id="content"
                  {...register("content")}
                  placeholder="具体的な内容をご記入ください (例: 〇〇の機能が動作しません。△△のような機能を追加してほしいです。)"
                  className={`min-h-[150px] ${errors.content ? "border-destructive" : ""}`}
                  disabled={isSubmitting}
                />
                {errors.content && <p className="text-xs text-destructive mt-1">{errors.content.message}</p>}
              </div>

              <div>
                <Label htmlFor="email">メールアドレス (任意)</Label>
                <Input
                  id="email"
                  type="email"
                  {...register("email")}
                  placeholder="返信が必要な場合はご記入ください"
                  className={errors.email ? "border-destructive" : ""}
                  disabled={isSubmitting}
                />
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  ご入力いただいたメールアドレスは、お問い合わせへの返信目的にのみ使用いたします。
                </p>
              </div>
              <CardFooter className="p-0 pt-4">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  <Send className="mr-2 h-4 w-4" />
                  {isSubmitting ? '送信中...' : '送信する'}
                </Button>
              </CardFooter>
            </form>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
