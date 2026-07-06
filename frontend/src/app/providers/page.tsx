"use client";

import React, { useState } from "react";
import dayjs from "dayjs";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Typography,
  Popconfirm,
  Tag,
  Space,
  message,
  Empty,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { providersApi } from "@/lib/api";
import { ProviderIcon } from "@/lib/icons";
import type { ProviderConfig, ProviderFormData } from "@/types";

const { Title, Text } = Typography;

export default function ProvidersPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [form] = Form.useForm();
  // 小眼睛状态：记录哪些行的 api_key 正在显示明文
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [nameFilter, setNameFilter] = useState("");

  // 查询提供商列表
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["providers"],
    queryFn: providersApi.list,
  });

  const allProviders = data?.providers || [];
  const filteredProviders = allProviders.filter((p: ProviderConfig) => {
    if (nameFilter && !p.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    return true;
  });

  // 创建提供商
  const createMutation = useMutation({
    mutationFn: (values: ProviderFormData) => providersApi.create(values),
    onSuccess: () => {
      message.success("提供商创建成功");
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      handleCloseModal();
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 更新提供商
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProviderFormData> }) =>
      providersApi.update(id, data),
    onSuccess: () => {
      message.success("提供商更新成功");
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      handleCloseModal();
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 删除提供商
  const deleteMutation = useMutation({
    mutationFn: (id: string) => providersApi.delete(id),
    onSuccess: () => {
      message.success("提供商已删除");
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const handleOpenCreate = () => {
    setEditingProvider(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleOpenEdit = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    form.setFieldsValue({
      name: provider.name,
      api_base: provider.api_base,
      api_key: "",
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingProvider(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editingProvider) {
      const data: Partial<ProviderFormData> = { ...values };
      if (!data.api_key) delete data.api_key;
      updateMutation.mutate({ id: editingProvider.id, data });
    } else {
      createMutation.mutate(values);
    }
  };

  // 切换小眼睛
  const toggleKeyVisible = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const columns = [
    {
      title: "提供商名称",
      dataIndex: "name",
      key: "name",
      width: 240,
      sorter: (a: ProviderConfig, b: ProviderConfig) => a.name.localeCompare(b.name),
      render: (v: string) => <ProviderIcon provider={v} />,
    },
    {
      title: "API 地址",
      dataIndex: "api_base",
      key: "api_base",
      width: 260,
      ellipsis: true,
      sorter: (a: ProviderConfig, b: ProviderConfig) => a.api_base.localeCompare(b.api_base),
    },
    {
      title: "API Key",
      dataIndex: "decrypted_api_key",
      key: "decrypted_api_key",
      width: 380,
      render: (v: string, record: ProviderConfig) => {
        const isVisible = visibleKeys.has(record.id);
        return (
          <Space>
            <code
              style={{
                maxWidth: isVisible ? "none" : 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: isVisible ? "normal" : "nowrap",
                display: "inline-block",
                wordBreak: "break-all",
              }}
            >
              {isVisible ? v : v ? "••••••••" : "-"}
            </code>
            {v && (
              <Button
                type="text"
                size="small"
                icon={isVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                onClick={() => toggleKeyVisible(record.id)}
              />
            )}
          </Space>
        );
      },
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 140,
      sorter: (a: ProviderConfig, b: ProviderConfig) => a.created_at.localeCompare(b.created_at),
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(v).format("MM-DD HH:mm")}
        </Text>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 180,
      align: "right" as const,
      render: (_: any, record: ProviderConfig) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此提供商？"
            description="删除后，使用该提供商的模型可能无法正常工作"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="w-full p-6 overflow-x-hidden box-border">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">提供商管理</h1>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <Button className="flex items-center gap-1" onClick={() => setShowFilters(!showFilters)}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
          过滤
        </Button>
        {nameFilter && <Button onClick={() => setNameFilter("")}>重置过滤</Button>}
      </div>

      {showFilters && (
        <div className="grid grid-cols-3 gap-x-6 gap-y-4 mb-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-600">提供商名称</label>
            <Input placeholder="搜索提供商..." value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} allowClear />
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow w-full max-w-full box-border">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div />
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700 whitespace-nowrap">共 {filteredProviders.length} 个提供商</span>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>刷新</Button>
            <Button icon={<PlusOutlined />} type="primary" onClick={handleOpenCreate}>添加提供商</Button>
          </div>
        </div>
        <div className="rounded-lg custom-border overflow-x-auto w-full max-w-full box-border">
          <Table dataSource={filteredProviders} columns={columns} rowKey="id" loading={isLoading} size="small" scroll={{ x: 900 }} pagination={false} className="ant-table-compact" locale={{ emptyText: <Empty description="暂无提供商" /> }} />
        </div>
      </div>

      <Modal title={editingProvider ? "编辑提供商" : "添加提供商"} open={modalOpen} onOk={handleSubmit} onCancel={handleCloseModal} confirmLoading={createMutation.isPending || updateMutation.isPending} destroyOnHidden width={520}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="提供商名称" rules={[{ required: true, message: "请输入提供商名称" }]}>
            <Input placeholder="如 OpenAI、Qwen、DeepSeek" />
          </Form.Item>
          <Form.Item name="api_base" label="API 地址" rules={[{ required: true, message: "请输入 API 地址" }]}>
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item name="api_key" label={editingProvider ? "API Key（留空不修改）" : "API Key"} rules={editingProvider ? [] : [{ required: true, message: "请输入 API Key" }]}>
            <Input.Password placeholder={editingProvider ? "留空则保持原 Key 不变" : "sk-xxxx"} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
